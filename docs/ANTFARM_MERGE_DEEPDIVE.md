# Antfarm → ClawDeck Merge: Deep Dive

## Phase 1: Workflow Runner Engine

### 1.1 Step Operations Service

**Source:** `antfarm/src/installer/step-ops.ts` (~860 lines)

**Core Functions to Port:**

```typescript
// nodejs/src/services/step-executor.service.ts

import { prisma } from '../db/prisma.js'
import crypto from 'node:crypto'

// Types
interface ClaimResult {
  found: boolean
  stepId?: string
  runId?: string
  resolvedInput?: string
}

interface CompleteResult {
  advanced: boolean
  runCompleted: boolean
}

interface FailResult {
  retrying: boolean
  runFailed: boolean
}

interface Story {
  id: string
  runId: string
  storyIndex: number
  storyId: string
  title: string
  description: string | null
  acceptanceCriteria: string[]
  status: string
  output?: string
  retryCount: number
  maxRetries: number
}

interface LoopConfig {
  over: 'stories'
  completion: 'all_done'
  freshSession?: boolean
  verifyEach?: boolean
  verifyStep?: string
}
```

**Key Functions:**

#### `claimStep(agentId: string): Promise<ClaimResult>`

The most complex function. Logic flow:

1. **Cleanup abandoned steps** - Find steps "running" > 15 min, reset or fail
2. **Find pending step** for this agent
3. **Handle loop steps** - Find next pending story, claim it
4. **Handle approval steps** - Mark as awaiting_approval, return no work
5. **Resolve template** - Replace `{{variables}}` with context
6. **Update step status** to 'running'

```typescript
async function claimStep(agentId: string): Promise<ClaimResult> {
  // 1. Cleanup abandoned (15 min threshold)
  await cleanupAbandonedSteps()

  // 2. Find pending step for this agent
  const step = await prisma.step.findFirst({
    where: {
      agentId,
      status: 'pending',
      run: { status: { notIn: ['failed', 'cancelled'] } }
    },
    include: { run: true }
  })

  if (!step) return { found: false }

  // 3. Get run context
  const context = JSON.parse(step.run.context || '{}')

  // 4. Handle loop steps
  if (step.type === 'loop') {
    return handleLoopStepClaim(step, context)
  }

  // 5. Handle approval steps
  if (step.type === 'approval') {
    await prisma.step.update({
      where: { id: step.id },
      data: { status: 'awaiting_approval' }
    })
    await prisma.run.update({
      where: { id: step.runId },
      data: { awaitingApproval: 1 }
    })
    return { found: false } // No agent work
  }

  // 6. Single step - claim it
  await prisma.step.update({
    where: { id: step.id },
    data: { status: 'running' }
  })

  const resolvedInput = resolveTemplate(step.inputTemplate, context)

  return {
    found: true,
    stepId: step.id,
    runId: step.runId,
    resolvedInput
  }
}
```

#### `completeStep(stepId: string, output: string): Promise<CompleteResult>`

1. **Parse output for context** - Extract `KEY: value` lines
2. **Handle STORIES_JSON** - Parse and insert stories (planner output)
3. **Handle loop step completion** - Mark story done, check for more
4. **Handle verify_each** - If verification step, pass/fail story
5. **Mark step done** and advance pipeline

```typescript
async function completeStep(stepId: string, output: string): Promise<CompleteResult> {
  const step = await prisma.step.findUnique({
    where: { id: stepId },
    include: { run: true }
  })
  if (!step) throw new Error('Step not found')

  // 1. Merge KEY: value into context
  const context = JSON.parse(step.run.context || '{}')
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_]+):\s*(.+)$/)
    if (match && !match[1].startsWith('STORIES_JSON')) {
      context[match[1].toLowerCase()] = match[2].trim()
    }
  }
  await prisma.run.update({
    where: { id: step.runId },
    data: { context: JSON.stringify(context) }
  })

  // 2. Parse STORIES_JSON (planner output)
  await parseAndInsertStories(output, step.runId)

  // 3. Handle loop step
  if (step.type === 'loop' && step.currentStoryId) {
    return handleLoopCompletion(step, output, context)
  }

  // 4. Check verify_each
  const loopStep = await prisma.step.findFirst({
    where: { runId: step.runId, type: 'loop' }
  })
  if (loopStep?.loopConfig) {
    const lc = loopStep.loopConfig as LoopConfig
    if (lc.verifyEach && lc.verifyStep === step.stepId) {
      return handleVerifyEachCompletion(step, loopStep, output, context)
    }
  }

  // 5. Single step - mark done
  await prisma.step.update({
    where: { id: stepId },
    data: { status: 'completed', output }
  })

  return advancePipeline(step.runId)
}
```

#### `failStep(stepId: string, error: string): Promise<FailResult>`

Retry logic with max retries:
- **Single step:** Retry step up to maxRetries, then fail run
- **Loop step:** Retry current story up to story.maxRetries, then fail run

```typescript
async function failStep(stepId: string, error: string): Promise<FailResult> {
  const step = await prisma.step.findUnique({
    where: { id: stepId },
    include: { run: true }
  })
  if (!step) throw new Error('Step not found')

  // Loop step - per-story retry
  if (step.type === 'loop' && step.currentStoryId) {
    const story = await prisma.story.findUnique({
      where: { id: step.currentStoryId }
    })
    if (story) {
      const newRetry = story.retryCount + 1
      if (newRetry > story.maxRetries) {
        // Fail story, step, and run
        await prisma.story.update({
          where: { id: story.id },
          data: { status: 'failed', retryCount: newRetry }
        })
        await prisma.step.update({
          where: { id: stepId },
          data: { status: 'failed', output: error }
        })
        await prisma.run.update({
          where: { id: step.runId },
          data: { status: 'failed' }
        })
        return { retrying: false, runFailed: true }
      }
      // Retry story
      await prisma.story.update({
        where: { id: story.id },
        data: { status: 'pending', retryCount: newRetry }
      })
      await prisma.step.update({
        where: { id: stepId },
        data: { status: 'pending', currentStoryId: null }
      })
      return { retrying: true, runFailed: false }
    }
  }

  // Single step
  const newRetry = step.retryCount + 1
  if (newRetry > step.maxRetries) {
    await prisma.step.update({
      where: { id: stepId },
      data: { status: 'failed', output: error, retryCount: newRetry }
    })
    await prisma.run.update({
      where: { id: step.runId },
      data: { status: 'failed' }
    })
    return { retrying: false, runFailed: true }
  }

  // Retry
  await prisma.step.update({
    where: { id: stepId },
    data: { status: 'pending', retryCount: newRetry }
  })
  return { retrying: true, runFailed: false }
}
```

### 1.2 Template Resolution

**Source:** `step-ops.ts:40-47`

```typescript
function resolveTemplate(
  template: string,
  context: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+(?:\.\w+)*)\}\}/g,
    (_match, key: string) => {
      if (key in context) return context[key]
      const lower = key.toLowerCase()
      if (lower in context) return context[lower]
      return `[missing: ${key}]`
    }
  )
}
```

**Available Template Variables:**

| Variable | Source | Description |
|----------|--------|-------------|
| `{{task}}` | Run.task | Original task description |
| `{{repo}}` | Context (planner output) | Repository path |
| `{{branch}}` | Context (setup output) | Git branch name |
| `{{build_cmd}}` | Context (setup output) | Build command |
| `{{test_cmd}}` | Context (setup output) | Test command |
| `{{current_story}}` | Generated | Current story details |
| `{{current_story_id}}` | Generated | Story ID |
| `{{completed_stories}}` | Generated | List of done stories |
| `{{stories_remaining}}` | Generated | Count of pending |
| `{{progress}}` | File read | progress.txt content |
| `{{verify_feedback}}` | Context | Verification feedback |
| `{{changes}}` | Context | Developer changes |
| `{{pr}}` | Context | PR URL |

### 1.3 Loop Step Handler

**Loop Step Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│                     LOOP STEP (type: loop)                   │
├─────────────────────────────────────────────────────────────┤
│  1. Agent claims step                                        │
│  2. Find next pending story                                  │
│  3. If no pending stories:                                   │
│     - If failed stories: return no work                      │
│     - If all done: mark step done, advance pipeline          │
│  4. Claim story (status = 'running')                         │
│  5. Set step.currentStoryId                                  │
│  6. Build story context variables                            │
│  7. Return resolved input to agent                           │
│                                                              │
│  When agent completes:                                       │
│  8. Mark story done                                          │
│  9. If verify_each:                                          │
│     - Set verify step to pending                             │
│     - Wait for verifier                                      │
│     - If retry: reset story to pending                       │
│  10. If more stories: reset step to pending                  │
│  11. If no more: mark done, advance                          │
└─────────────────────────────────────────────────────────────┘
```

**Loop Config in YAML:**

```yaml
- id: implement
  agent: developer
  type: loop
  loop:
    over: stories
    completion: all_done
    fresh_session: true
    verify_each: true
    verify_step: verify
```

---

## Phase 2: Workflow Templates

### 2.1 feature-dev Workflow

**7 Steps, 6 Agents:**

```
plan → setup → implement (loop) → verify → test → pr → review
                     │
                     └── loops over stories
                          │
                          └── verify_each: verify step runs after each story
```

**Agent Roles:**

| Agent | Role | Tools |
|-------|------|-------|
| planner | analysis | read, grep, git - NO write |
| setup | coding | full read/write/exec |
| developer | coding | full read/write/exec |
| verifier | verification | read, exec - NO write |
| tester | testing | read, exec, browser |
| reviewer | analysis | read, gh - NO write |

### 2.2 bug-fix Workflow

**6 Steps, 5 Agents:**

```
triage → investigate → setup → fix → verify → PR
```

### 2.3 security-audit Workflow

**7 Steps, 6 Agents:**

```
scan → prioritize → setup → fix → verify → test → PR
```

### 2.4 Template Seeding

Add to `nodejs/prisma/seeds/workflows.ts`:

```typescript
export const WORKFLOW_TEMPLATES = [
  {
    name: 'feature-dev',
    description: 'Feature development workflow',
    steps: [
      {
        stepId: 'plan',
        name: 'Plan',
        agentId: 'planner',
        type: 'single',
        inputTemplate: `Decompose the following task into ordered user stories...

TASK:
{{task}}

Reply with:
STATUS: done
REPO: /path/to/repo
BRANCH: feature-branch-name
STORIES_JSON: [ ... array of story objects ... ]`,
        expects: 'STATUS: done',
        maxRetries: 2
      },
      {
        stepId: 'setup',
        name: 'Setup',
        agentId: 'setup',
        type: 'single',
        inputTemplate: `Prepare the development environment...

TASK: {{task}}
REPO: {{repo}}
BRANCH: {{branch}}

Reply with:
STATUS: done
BUILD_CMD: <command>
TEST_CMD: <command>`,
        expects: 'STATUS: done',
        maxRetries: 2
      },
      {
        stepId: 'implement',
        name: 'Implement',
        agentId: 'developer',
        type: 'loop',
        loopConfig: {
          over: 'stories',
          completion: 'all_done',
          freshSession: true,
          verifyEach: true,
          verifyStep: 'verify'
        },
        inputTemplate: `Implement the following user story...

TASK: {{task}}
REPO: {{repo}}
BRANCH: {{branch}}
CURRENT STORY: {{current_story}}
COMPLETED STORIES: {{completed_stories}}
VERIFY FEEDBACK: {{verify_feedback}}

Reply with:
STATUS: done
CHANGES: what you implemented`,
        expects: 'STATUS: done',
        maxRetries: 2
      },
      {
        stepId: 'verify',
        name: 'Verify',
        agentId: 'verifier',
        type: 'single',
        inputTemplate: `Verify the developer's work...

CURRENT STORY: {{current_story}}
CHANGES: {{changes}}
TEST_CMD: {{test_cmd}}

Reply with:
STATUS: done
VERIFIED: What you confirmed

Or if incomplete:
STATUS: retry
ISSUES:
- What's missing`,
        expects: 'STATUS: done'
      },
      {
        stepId: 'test',
        name: 'Test',
        agentId: 'tester',
        type: 'single',
        inputTemplate: `Integration and E2E testing...

TASK: {{task}}
REPO: {{repo}}
BRANCH: {{branch}}
TEST_CMD: {{test_cmd}}

Reply with:
STATUS: done
RESULTS: What you tested`,
        expects: 'STATUS: done'
      },
      {
        stepId: 'pr',
        name: 'Create PR',
        agentId: 'developer',
        type: 'single',
        inputTemplate: `Create a pull request...

TASK: {{task}}
REPO: {{repo}}
BRANCH: {{branch}}
CHANGES: {{changes}}

Use: gh pr create

Reply with:
STATUS: done
PR: URL to the pull request`,
        expects: 'STATUS: done'
      },
      {
        stepId: 'review',
        name: 'Review',
        agentId: 'reviewer',
        type: 'single',
        inputTemplate: `Review the pull request...

PR: {{pr}}
TASK: {{task}}

Reply with:
STATUS: done
DECISION: approved`,
        expects: 'STATUS: done'
      }
    ]
  },
  // bug-fix and security-audit templates...
]
```

---

## Phase 3: Agent Integration

### 3.1 Agent Workspace Files

**Option A: Database (Recommended for ClawDeck)**

Add `AgentFile` model:

```prisma
model AgentFile {
  id        BigInt   @id @default(autoincrement())
  agentId   BigInt   @map("agent_id")
  filename  String   // AGENTS.md, SOUL.md, IDENTITY.md
  content   String   @db.Text
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  agent     Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@unique([agentId, filename])
  @@map("agent_files")
}
```

**Option B: File System**

```
clawdeck/
└── agents/
    ├── planner/
    │   ├── AGENTS.md
    │   ├── SOUL.md
    │   └── IDENTITY.md
    ├── developer/
    │   └── ...
    └── shared/
        ├── setup/
        ├── verifier/
        └── ...
```

### 3.2 Role-Based Tool Policies

From `antfarm/src/installer/install.ts:61-127`:

```typescript
const ROLE_TOOL_POLICIES = {
  analysis: {
    profile: 'coding',
    deny: ['write', 'edit', 'apply_patch', 'image', 'tts', 'group:ui']
  },
  coding: {
    profile: 'coding',
    deny: ['image', 'tts', 'group:ui']
  },
  verification: {
    profile: 'coding',
    deny: ['write', 'edit', 'apply_patch', 'image', 'tts', 'group:ui']
  },
  testing: {
    profile: 'coding',
    alsoAllow: ['browser', 'web_search', 'web_fetch'],
    deny: ['write', 'edit', 'apply_patch', 'image', 'tts']
  },
  pr: {
    profile: 'coding',
    deny: ['write', 'edit', 'apply_patch', 'image', 'tts', 'group:ui']
  },
  scanning: {
    profile: 'coding',
    alsoAllow: ['web_search', 'web_fetch'],
    deny: ['write', 'edit', 'apply_patch', 'image', 'tts', 'group:ui']
  }
}
```

---

## Phase 4: Execution API

### 4.1 New Routes

**`nodejs/src/routes/step-operations.ts`:**

```typescript
// POST /api/v1/steps/claim
fastify.post('/claim', async (request, reply) => {
  const { agentId, agentUuid } = request.body

  // Verify agent exists and belongs to user
  const agent = await prisma.agent.findFirst({
    where: { uuid: agentUuid }
  })
  if (!agent) return reply.code(404).send({ error: 'Agent not found' })

  const result = await stepExecutor.claimStep(agentId)

  if (!result.found) {
    return { found: false }
  }

  return {
    found: true,
    stepId: result.stepId,
    runId: result.runId,
    input: result.resolvedInput
  }
})

// POST /api/v1/steps/:id/complete
fastify.post('/:id/complete', async (request, reply) => {
  const { id } = request.params
  const { output } = request.body

  const result = await stepExecutor.completeStep(id, output)

  return {
    advanced: result.advanced,
    runCompleted: result.runCompleted
  }
})

// POST /api/v1/steps/:id/fail
fastify.post('/:id/fail', async (request, reply) => {
  const { id } = request.params
  const { error } = request.body

  const result = await stepExecutor.failStep(id, error)

  return {
    retrying: result.retrying,
    runFailed: result.runFailed
  }
})

// POST /api/v1/steps/:id/approve
fastify.post('/:id/approve', async (request, reply) => {
  const { id } = request.params
  const { approver } = request.body

  const result = await stepExecutor.approveStep(id, approver)

  return result
})

// POST /api/v1/steps/:id/reject
fastify.post('/:id/reject', async (request, reply) => {
  const { id } = request.params
  const { reason } = request.body

  const result = await stepExecutor.rejectStep(id, reason)

  return result
})
```

### 4.2 Run Trigger Enhancement

**Update `nodejs/src/routes/runs.ts`:**

```typescript
// POST /api/v1/runs - Trigger workflow run
fastify.post('/', async (request, reply) => {
  const { workflowId, task, taskId, notifyUrl } = request.body

  // Create run
  const run = await runService.createRun({
    workflowId,
    task,
    taskId,
    notifyUrl
  })

  // Link to ClawDeck task if provided
  if (taskId) {
    await prisma.task.update({
      where: { id: BigInt(taskId) },
      data: {
        workflowRunId: run.id,
        workflowType: (await prisma.workflow.findUnique({
          where: { id: BigInt(workflowId) }
        }))?.name
      }
    })
  }

  return reply.code(201).send({
    success: true,
    data: {
      id: run.id,
      workflowId: run.workflowId,
      task: run.task,
      status: run.status
    }
  })
})
```

---

## Phase 5: Dashboard Integration

### 5.1 WebSocket Events

Add to existing WebSocket infrastructure:

```typescript
// Event types
type WorkflowEvent =
  | { type: 'run.started'; runId: string; workflowId: string }
  | { type: 'run.completed'; runId: string; workflowId: string }
  | { type: 'run.failed'; runId: string; workflowId: string; detail: string }
  | { type: 'step.pending'; runId: string; stepId: string }
  | { type: 'step.running'; runId: string; stepId: string; agentId: string }
  | { type: 'step.done'; runId: string; stepId: string }
  | { type: 'step.failed'; runId: string; stepId: string; detail: string }
  | { type: 'story.started'; runId: string; storyId: string; title: string }
  | { type: 'story.done'; runId: string; storyId: string }
  | { type: 'story.retry'; runId: string; storyId: string; detail: string }
  | { type: 'pipeline.advanced'; runId: string; stepId: string }
```

### 5.2 Run Detail Page

**`frontend/src/pages/RunDetailPage.tsx`:**

```tsx
export default function RunDetailPage() {
  const { runId } = useParams()
  const { data: run, isLoading } = useRun(runId)
  const { data: steps } = useSteps(runId)
  const { data: stories } = useStories(runId)

  // WebSocket subscription for real-time updates
  useEffect(() => {
    subscribeToRun(runId, (event) => {
      queryClient.invalidateQueries(['run', runId])
      queryClient.invalidateQueries(['steps', runId])
      queryClient.invalidateQueries(['stories', runId])
    })
    return () => unsubscribeFromRun(runId)
  }, [runId])

  return (
    <div>
      <RunStatusBadge status={run.status} />

      {/* Steps Progress */}
      <div className="steps-timeline">
        {steps.map(step => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>

      {/* Stories (for loop steps) */}
      {stories.length > 0 && (
        <div className="stories-list">
          {stories.map(story => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}

      {/* Output Log */}
      <OutputLog runId={runId} />
    </div>
  )
}
```

---

## Phase 6: Task-Workflow Linking

### 6.1 Task Assignment with Workflow

When assigning a task to an agent, optionally select a workflow:

```tsx
// frontend/src/components/AssignTaskModal.tsx
function AssignTaskModal({ task }) {
  const [workflowType, setWorkflowType] = useState<string | null>(null)

  const handleAssign = async () => {
    // Update task assignment
    await updateTask(task.id, { assignedToAgent: true })

    // If workflow selected, create run
    if (workflowType) {
      const workflow = await getWorkflowByName(workflowType)
      await createRun({
        workflowId: workflow.id,
        task: task.name,
        taskId: task.id
      })
    }
  }

  return (
    <Modal>
      <Select
        label="Workflow (optional)"
        value={workflowType}
        onChange={setWorkflowType}
        options={[
          { value: null, label: 'None - Simple assignment' },
          { value: 'feature-dev', label: 'Feature Development' },
          { value: 'bug-fix', label: 'Bug Fix' },
          { value: 'security-audit', label: 'Security Audit' }
        ]}
      />
      <Button onClick={handleAssign}>Assign</Button>
    </Modal>
  )
}
```

### 6.2 Activity Feed Integration

Workflow events appear in task activity:

```typescript
// When step completes
await prisma.taskActivity.create({
  data: {
    taskId: task.id,
    action: 'workflow_step_completed',
    actorType: 'agent',
    actorName: step.agentId,
    note: `Completed step: ${step.name}\n\n${output}`
  }
})
```

---

## Implementation Checklist

### Phase 1: Runner Engine
- [ ] Create `step-executor.service.ts`
- [ ] Implement `claimStep()` with loop handling
- [ ] Implement `completeStep()` with STORIES_JSON parsing
- [ ] Implement `failStep()` with retry logic
- [ ] Implement `approveStep()` and `rejectStep()`
- [ ] Implement `resolveTemplate()`
- [ ] Implement `advancePipeline()`
- [ ] Implement `cleanupAbandonedSteps()`

### Phase 4: Execution API
- [ ] Add `/api/v1/steps/claim` endpoint
- [ ] Add `/api/v1/steps/:id/complete` endpoint
- [ ] Add `/api/v1/steps/:id/fail` endpoint
- [ ] Add `/api/v1/steps/:id/approve` endpoint
- [ ] Add `/api/v1/steps/:id/reject` endpoint
- [ ] Update run creation to link tasks

### Phase 2: Templates
- [ ] Create workflow template seeds
- [ ] Add `/api/v1/workflow-templates` endpoint
- [ ] Add template selection to WorkflowsPage

### Phase 5: Dashboard
- [ ] Add WebSocket events for workflow
- [ ] Create RunDetailPage
- [ ] Add real-time status updates

### Phase 6: Task Linking
- [ ] Update task assignment modal
- [ ] Add workflow events to activity feed
- [ ] Show workflow status on task cards

### Phase 3: Agents
- [ ] Add AgentFile model (optional)
- [ ] Implement role-based tool policies
- [ ] Add agent file management API
