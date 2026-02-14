# Antfarm Integration into ClawDeck

## Overview

The **Antfarm** workflow orchestration system was merged into ClawDeck, providing multi-agent workflow capabilities within the kanban dashboard. This document describes the integration.

**Original Antfarm Location:** `~/repos/antfarm/`
**Integration Status:** ✅ Complete (merged into ClawDeck)

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

### 3. API Routes

| Route | Location | Endpoints |
|-------|----------|-----------|
| `workflows.ts` | `nodejs/src/routes/` | CRUD + YAML import |
| `runs.ts` | `nodejs/src/routes/` | Run management |
| `steps.ts` | `nodejs/src/routes/` | Step updates |
| `stories.ts` | `nodejs/src/routes/` | Story tracking |

### 4. Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `WorkflowsPage.tsx` | `frontend/src/pages/` | Workflow management UI |
| `RunsPage.tsx` | `frontend/src/pages/` | Run monitoring UI |
| `StepEditor.tsx` | `frontend/src/components/` | Visual step editor |
| `useWorkflows.ts` | `frontend/src/hooks/` | Workflow data hook |
| `useRuns.ts` | `frontend/src/hooks/` | Run data hook |

### 5. Task Integration

The `Task` model now links to workflow runs:

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
- **loop**: Iterates over stories/items
- **approval**: Requires human approval

### Step States
- `waiting` - Not yet started
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
PATCH  /api/v1/runs/:id            # Update run status
```

### Steps & Stories
```
GET    /api/v1/runs/:runId/steps   # List steps in run
PATCH  /api/v1/steps/:id           # Update step status
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

## Original Antfarm Features vs Current Implementation

| Feature | Antfarm | ClawDeck Integration |
|---------|---------|---------------------|
| CLI commands | `antfarm install`, `antfarm workflow run` | REST API + Web UI |
| Dashboard | Separate `antfarm dashboard` | Integrated in ClawDeck |
| Database | SQLite (default) | PostgreSQL (shared) |
| Cron polling | Built-in cron jobs | API-driven execution |
| YAML workflows | ✅ | ✅ |
| Multi-agent | ✅ | ✅ |
| Step tracking | ✅ | ✅ |

## Migration Notes

- Antfarm's standalone CLI was **not** merged; only the core workflow engine
- The workflow runner/executor logic would need to be implemented separately
- ClawDeck provides the **UI and API** for workflow management
- Actual agent execution is handled externally (via OpenClaw or other agents)

## Related Commits

- `b033c1c` - "feat: Add React frontend, workflow system, and comprehensive tests"
- `8203aab` - "feat: Add workflow step editor, board filters, E2E tests, and bug fixes"

## Testing

Integration tests exist at:
- `nodejs/tests/integration/workflows.test.js`
- `nodejs/tests/integration/steps.test.js`
- `nodejs/tests/integration/stories.test.js`
- `e2e/tests/workflows.spec.ts`

## Future Enhancements

Potential improvements to complete the integration:

1. **Workflow Runner**: Implement the actual execution engine that polls and runs workflows
2. **Agent Integration**: Connect ClawDeck agents to workflow steps
3. **Webhooks**: Add webhook support for run completion notifications
4. **Real-time Updates**: WebSocket integration for live run status
5. **Workflow Templates**: Pre-built workflows (feature-dev, bug-fix, security-audit)
