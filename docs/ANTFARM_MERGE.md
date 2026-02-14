# Antfarm Integration into ClawDeck

## Overview

The **Antfarm** workflow orchestration system was merged into ClawDeck, providing multi-agent workflow capabilities within the kanban dashboard. This document describes the integration.

**Original Antfarm Location:** `~/repos/antfarm/`
**Integration Status:** ✅ Phase 1-2 Complete

## Implementation Progress

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Workflow Executor Service | ✅ Complete |
| Phase 2 | API Routes for Steps/Runs | ✅ Complete |
| Phase 3 | Agent API Integration | ⏳ In Progress |
| Phase 4 | Scheduler (cleanup, retry) | 🔲 Pending |
| Phase 5 | WebSocket Events | 🔲 Pending |

## What Was Merged

### 1. Database Models (Prisma Schema)

Located in `nodejs/prisma/schema.prisma` (lines 403-518):

| Model | Purpose |
|-------|---------|
| `Workflow` | Workflow template with steps configuration |
| `WorkflowStep` | Individual steps in a workflow template |
| `Run` | Single workflow execution instance |
| `Step` | Represents a step in a workflow run |
| `Story` | Iteration within a loop step |

### 2. Backend Services

| Service | Location | Purpose |
|---------|----------|---------|
| `workflow.service.ts` | `nodejs/src/services/` | CRUD for workflows and steps |
| `run.service.ts` | `nodejs/src/services/` | Run lifecycle management |
| `step.service.ts` | `nodejs/src/services/` | Step execution tracking |
| `story.service.ts` | `nodejs/src/services/` | Story/iteration tracking |
| `yaml-import.service.ts` | `nodejs/src/services/` | YAML workflow parsing |
| `workflow-executor.service.ts` | `nodejs/src/services/` | **NEW** Intelligence layer |

### 3. Workflow Executor Service (NEW)

The `workflow-executor.service.ts` provides the "intelligence layer" for workflow execution:

| Function | Purpose |
|----------|---------|
| `resolveTemplate()` | Replace `{{variable}}` placeholders with context |
| `mergeContextFromOutput()` | Extract KEY: value pairs from agent output |
| `parseStoriesJson()` | Parse STORIES_JSON from planner output |
| `formatStoryForTemplate()` | Format story for template injection |
| `formatCompletedStories()` | List completed stories |
| `claimStepByAgent()` | Find and claim pending step for agent |
| `advancePipeline()` | Set next waiting step to pending |
| `completeStepWithPipeline()` | Complete step and advance pipeline |
| `completeLoopStoryWithVerify()` | Handle verify_each flow for loop steps |
| `approveStep()` | Approve awaiting_approval step |
| `rejectStep()` | Reject awaiting_approval step |
| `cleanupAbandonedSteps()` | Reset steps stuck > 15 minutes |

### 4. API Routes

| Route | Location | Endpoints |
|-------|----------|-----------|
| `workflows.ts` | `nodejs/src/routes/` | CRUD + YAML import |
| `runs.ts` | `nodejs/src/routes/` | Run management |
| `steps.ts` | `nodejs/src/routes/` | Step updates + **approve/reject** |
| `stories.ts` | `nodejs/src/routes/` | Story tracking |

### 5. Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `WorkflowsPage.tsx` | `frontend/src/pages/` | Workflow management UI |
| `RunsPage.tsx` | `frontend/src/pages/` | Run monitoring UI |
| `StepEditor.tsx` | `frontend/src/components/` | Visual step editor |
| `useWorkflows.ts` | `frontend/src/hooks/` | Workflow data hook |
| `useRuns.ts` | `frontend/src/hooks/` | Run data hook |

### 6. Task Integration

The `Task` model links to workflow runs:

```prisma
model Task {
  workflowType  String?  @map("workflow_type")  // "feature-dev", "bug-fix", etc.
  workflowRunId String?  @map("workflow_run_id") // Link to Run
  workflowRun   Run?     @relation("TaskRun")
}
```

## Workflow Capabilities

### Step Types
- **single**: One-time execution
- **loop**: Iterates over stories/items (with verify_each support)
- **approval**: Requires human approval

### Step States
- `waiting` - Not yet started
- `pending` - Ready to be claimed
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Error occurred
- `awaiting_approval` - Waiting for human input

### Run States
- `running` - Active execution
- `completed` - All steps done
- `failed` - Stopped due to error

## API Endpoints

### Workflows
```
GET    /api/v1/workflows           # List workflows
GET    /api/v1/workflows/:id       # Get single workflow
POST   /api/v1/workflows           # Create workflow
PATCH  /api/v1/workflows/:id       # Update workflow
DELETE /api/v1/workflows/:id       # Delete workflow
POST   /api/v1/workflows/import-yaml  # Import from YAML
```

### Runs
```
GET    /api/v1/runs                # List runs
GET    /api/v1/runs/:id            # Get run details
POST   /api/v1/runs                # Trigger a run
PATCH  /api/v1/runs/:id/status     # Update run status
```

### Steps
```
GET    /api/v1/runs/:runId/steps       # List steps in run
GET    /api/v1/runs/:runId/steps/pending  # Get next pending step
POST   /api/v1/runs/:runId/steps/:stepId/claim   # Claim a step
POST   /api/v1/runs/:runId/steps/:stepId/complete # Complete a step
POST   /api/v1/runs/:runId/steps/:stepId/fail     # Fail a step (with retry)
POST   /api/v1/runs/:runId/steps/:stepId/approve  # Approve step
POST   /api/v1/runs/:runId/steps/:stepId/reject   # Reject step
PATCH  /api/v1/runs/:runId/steps/:stepId          # Update step
```

### Stories
```
GET    /api/v1/runs/:runId/stories # List stories
PATCH  /api/v1/stories/:id         # Update story status
```

## YAML Import Format

```yaml
name: my-workflow
description: A sample workflow
steps:
  - step_id: step1
    name: First Step
    agent_id: architect
    input_template: |
      Process this task: {{task}}
    expects: "STATUS: done"
    type: single
```

## Testing

### Unit Tests
- `nodejs/tests/unit/workflowExecutorService.test.js` - 29 tests for executor service

### Integration Tests
- `nodejs/tests/integration/workflows.test.js`
- `nodejs/tests/integration/steps.test.js`
- `nodejs/tests/integration/stories.test.js`

### E2E Tests
- `e2e/tests/workflows.spec.ts` - Workflow UI tests
- `e2e/tests/workflow-executor.spec.ts` - Execution flow tests (claim, complete, retry, approve, reject)

## Related Commits

- `b033c1c` - "feat: Add React frontend, workflow system, and comprehensive tests"
- `8203aab` - "feat: Add workflow step editor, board filters, E2E tests, and bug fixes"
- `abf96ea` - "feat: add workflow executor service with remaining features"

## Remaining Work

### Phase 3: Agent API Integration
- [ ] Create `/api/v1/steps/claim-by-agent` endpoint (agents poll for work)
- [ ] Integrate workflow executor into step claiming
- [ ] Add template resolution on claim

### Phase 4: Scheduler
- [ ] Abandoned step cleanup cron job
- [ ] Auto-retry failed steps
- [ ] Run timeout handling

### Phase 5: Real-time Updates
- [ ] WebSocket events for step status changes
- [ ] Run completion notifications
