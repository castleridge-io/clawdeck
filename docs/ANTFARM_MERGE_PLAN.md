# Antfarm → ClawDeck Complete Merge Plan

## Goal

Merge all remaining Antfarm functionality into ClawDeck so it works as a single unified system for:
- Kanban task management
- Multi-agent workflow orchestration
- Workflow execution (plan → implement → verify → test → PR → review)

## Current State

| Component | Antfarm | ClawDeck | Status |
|-----------|---------|----------|--------|
| Database models | SQLite | PostgreSQL | ✅ Merged |
| Workflow CRUD API | - | REST API | ✅ Merged |
| Workflow UI | Dashboard | React UI | ✅ Merged |
| YAML import | CLI | REST API | ✅ Merged |
| **Workflow Runner** | CLI + cron | - | ❌ Missing |
| **Step Operations** | CLI | - | ❌ Missing |
| **Agent Provisioning** | CLI | - | ❌ Missing |
| **Workflow Templates** | YAML files | - | ❌ Missing |
| **Agent Definitions** | AGENTS.md files | - | ❌ Missing |

## Phase 1: Workflow Runner Engine

### 1.1 Step Operations Service

Create `nodejs/src/services/step-executor.service.ts`:

```typescript
// Core operations migrated from antfarm/src/installer/step-ops.ts
interface StepExecutor {
  // Claim pending step for an agent
  claimStep(agentId: string): Promise<ClaimResult | null>

  // Complete a step with output
  completeStep(stepId: string, output: string): Promise<CompleteResult>

  // Fail a step with retry logic
  failStep(stepId: string, error: string): Promise<FailResult>

  // Resolve template variables in input
  resolveInputTemplate(template: string, context: RunContext): string

  // Advance pipeline to next step
  advancePipeline(runId: string): Promise<void>
}
```

### 1.2 Template Resolution

Migrate template resolution logic:
- `{{task}}` - Run task description
- `{{repo}}` - Repository path
- `{{branch}}` - Git branch
- `{{current_story}}` - Current story in loop
- `{{completed_stories}}` - Completed stories summary
- `{{progress}}` - Progress log
- `{{verify_feedback}}` - Verification feedback

### 1.3 Loop Step Handler

Handle `type: loop` steps with:
- Story iteration
- `fresh_session: true` per story
- `verify_each: true` integration
- Story completion tracking

## Phase 2: Workflow Templates

### 2.1 Database Seed Templates

Add to `nodejs/src/db/seed.ts`:

```typescript
const WORKFLOW_TEMPLATES = [
  {
    name: 'feature-dev',
    description: 'Feature development workflow',
    steps: [
      { stepId: 'plan', agentId: 'planner', type: 'single', ... },
      { stepId: 'setup', agentId: 'setup', type: 'single', ... },
      { stepId: 'implement', agentId: 'developer', type: 'loop', ... },
      { stepId: 'verify', agentId: 'verifier', type: 'single', ... },
      { stepId: 'test', agentId: 'tester', type: 'single', ... },
      { stepId: 'pr', agentId: 'developer', type: 'single', ... },
      { stepId: 'review', agentId: 'reviewer', type: 'single', ... },
    ]
  },
  {
    name: 'bug-fix',
    description: 'Bug fix workflow',
    steps: [...]
  },
  {
    name: 'security-audit',
    description: 'Security audit workflow',
    steps: [...]
  }
]
```

### 2.2 Template API Endpoints

```
GET  /api/v1/workflow-templates      # List available templates
POST /api/v1/workflows/from-template # Create workflow from template
```

## Phase 3: Agent Integration

### 3.1 Agent Workspace Files

Store agent definitions in database or file system:

```
Option A: Database (AgentFile table)
- agent_id: string
- filename: string (AGENTS.md, SOUL.md, IDENTITY.md)
- content: text

Option B: File system (clawdeck/agents/)
- agents/
  ├── planner/
  │   ├── AGENTS.md
  │   ├── SOUL.md
  │   └── IDENTITY.md
  ├── developer/
  │   └── ...
  └── ...
```

### 3.2 Agent API Enhancement

Extend existing `/api/v1/agents` to support:
- Workspace file management
- Role-based tool policies (analysis, coding, verification, testing)
- Subagent permissions

## Phase 4: Execution API

### 4.1 Step Claim Endpoint

```
POST /api/v1/steps/claim
{
  "agentId": "feature-dev/developer",
  "agentUuid": "uuid-of-agent"
}

Response:
{
  "found": true,
  "stepId": "step-123",
  "runId": "run-abc",
  "input": "resolved input template..."
}
```

### 4.2 Step Complete/Fail Endpoints

```
POST /api/v1/steps/:id/complete
{ "output": "STATUS: done\nCHANGES: ..." }

POST /api/v1/steps/:id/fail
{ "error": "Error message" }
```

### 4.3 Run Trigger Endpoint

```
POST /api/v1/runs
{
  "workflowId": "1",
  "task": "Add user authentication",
  "taskId": "optional-link-to-clawdeck-task",
  "notifyUrl": "optional-webhook"
}
```

## Phase 5: Dashboard Integration

### 5.1 Real-time Run Status

- WebSocket events for step status changes
- Live progress updates
- Story completion tracking

### 5.2 Run Management UI

- View active runs
- Resume failed runs
- View step outputs
- Story progress visualization

## Phase 6: Task → Workflow Linking

### 6.1 Task Workflow Assignment

When assigning a task to an agent:
1. Option to select workflow type (feature-dev, bug-fix, etc.)
2. Create run linked to task
3. Task status reflects workflow progress

### 6.2 Activity Feed Integration

- Workflow events appear in task activity feed
- Step completions logged as activities
- Agent assignments shown per step

## Implementation Order

```
Phase 1.1-1.3: Workflow Runner Engine     [Core functionality]
Phase 4.1-4.3: Execution API               [Agent interface]
Phase 2.1-2.2: Workflow Templates          [Pre-built workflows]
Phase 5.1-5.2: Dashboard Integration       [UI enhancements]
Phase 6.1-6.2: Task-Workflow Linking       [Unified experience]
Phase 3.1-3.2: Agent Integration           [Advanced features]
```

## Files to Create/Modify

### New Files
- `nodejs/src/services/step-executor.service.ts`
- `nodejs/src/services/template-resolver.service.ts`
- `nodejs/src/services/loop-handler.service.ts`
- `nodejs/src/routes/step-operations.ts`
- `nodejs/src/routes/workflow-templates.ts`
- `nodejs/prisma/seeds/workflow-templates.ts`
- `frontend/src/pages/RunDetailPage.tsx`
- `frontend/src/components/RunStatusBadge.tsx`

### Modified Files
- `nodejs/src/routes/runs.ts` - Add trigger endpoint
- `nodejs/src/routes/steps.ts` - Add claim/complete/fail
- `nodejs/src/db/seed.ts` - Add workflow templates
- `frontend/src/pages/WorkflowsPage.tsx` - Add template selection
- `frontend/src/hooks/useRuns.ts` - Add real-time updates

## Migration from Antfarm

### What to keep in ClawDeck
- Workflow models ✅ (already done)
- REST API ✅ (already done)
- React UI ✅ (already done)

### What to port from Antfarm
- `src/installer/step-ops.ts` → `step-executor.service.ts`
- `src/installer/run.ts` → `run-executor.service.ts`
- Template resolution logic
- Loop step handling
- Workflow YAML definitions

### What to discard
- SQLite database (using PostgreSQL)
- CLI commands (using REST API)
- Cron-based orchestration (using API-driven execution)
- OpenClaw config manipulation (ClawDeck has its own agent system)

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Runner Engine | High | Critical |
| Phase 4: Execution API | Medium | Critical |
| Phase 2: Templates | Low | High |
| Phase 5: Dashboard | Medium | Medium |
| Phase 6: Task Linking | Medium | Medium |
| Phase 3: Agent Integration | High | Low |

## Next Steps

1. **Confirm approach**: Database vs file system for agent definitions?
2. **Start with Phase 1**: Create step-executor.service.ts
3. **Port template resolution**: Migrate from Antfarm
4. **Add execution API**: REST endpoints for step operations

---

Ready to proceed with implementation?
