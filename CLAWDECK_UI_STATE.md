# ClawDeck UI - Current State Document

## Overview
Documenting the current state of the ClawDeck React UI development for OpenClaw task management integration.

## Context

### What We're Building
A React-based web UI for the ClawDeck Node.js API to:
- Visualize the 7 agent boards created during migration setup
- Display tasks with kanban-style column layout
- Enable task management (create, assign, claim, complete, delete)
- Provide real-time visibility into OpenClaw agent work

### Why This Matters
- The original ClawDeck has a Rails UI but Ruby isn't installed on this system
- We have a working Node.js API (port 3001) that needs a frontend
- OpenClaw agents are JavaScript-based, so a React UI fits the architecture

## What's Been Built

### ✅ Completed Components

#### 1. Project Structure
**Location**: `~/tools/clawdeck/nodejs/frontend/`

```
frontend/
├── package.json          # Dependencies: React, Vite, Tailwind
├── vite.config.js       # Vite config with API proxy to port 3001
├── tailwind.config.js    # Tailwind CSS configuration
├── postcss.config.js     # PostCSS with Tailwind and Autoprefixer
├── index.html           # Entry HTML
└── src/
    ├── main.jsx         # React entry point
    ├── App.jsx          # Main app component
    ├── App.css          # Global styles
    ├── index.css        # Tailwind directives
    ├── lib/
    │   └── api.js       # API client for ClawDeck backend
    └── components/
        ├── Header.jsx           # Header with stats and board selector
        ├── Header.css
        ├── KanbanBoard.jsx      # Kanban board with drag-drop columns
        ├── KanbanBoard.css
        ├── TaskModal.jsx        # Create/edit task modal
        ├── TaskModal.css
        ├── LoadingSpinner.jsx   # Loading state
        └── LoadingSpinner.css
```

#### 2. Features Implemented

**Header**:
- Board selector dropdown for all 7 agent boards
- Live statistics (total boards, tasks, active, done)
- "New Task" button to open task creation modal
- Agent emoji and board name display

**Kanban Board**:
- 5 columns: Inbox, Up Next, In Progress, In Review, Done
- Drag-and-drop task cards between columns
- Task cards with:
  - Priority indicator (colored left border)
  - Task title and description
  - Tags display
  - Assignment/Claim status badges
  - Action buttons (Edit, Assign, Claim, Complete, Delete)
- Empty state when no tasks in column
- Responsive design for mobile

**Task Management**:
- Create new tasks with:
  - Name, description, priority, status, tags
- Edit existing tasks
- Delete tasks
- Assign tasks to agents
- Claim tasks (start working)
- Complete tasks
- Real-time updates via API calls

**API Integration** (`src/lib/api.js`):
- `getBoards()` - Fetch all boards
- `getBoard(id)` - Fetch specific board
- `getTasks(boardId)` - Fetch tasks for a board
- `createTask(data)` - Create new task
- `updateTask(id, updates)` - Update task
- `deleteTask(id)` - Delete task
- `assignTask(id)` - Assign to agent
- `claimTask(id)` - Claim task
- `unclaimTask(id)` - Unclaim task
- `completeTask(id)` - Mark complete
- `getNextTask()` - Get next available task

#### 3. Styling
- Dark theme matching ClawDeck aesthetic
- Tailwind CSS for utility-first styling
- Custom CSS for:
  - Kanban columns and cards
  - Modal overlays
  - Drag-and-drop states
  - Responsive mobile layout
- Color-coded priorities and statuses

#### 4. Dependencies Installed
```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vite": "^6.0.7"
  }
}
```

### ⏳ Current Blocker

**Port Conflict**: Port 3000 is already in use
- **Solution**: Configured Vite to use port 3002 instead
- **Status**: Ready to start once port is available

### 📋 Agent Board Mappings (from Migration Phase 3)

| Agent | Board ID | Name | Emoji |
|-------|----------|------|-------|
| Jarvis Leader | 40 | Jarvis Leader Board | 👔 |
| Dave Engineer | 41 | Dave Engineer Board | 👨‍💻 |
| Sally Designer | 42 | Sally Designer Board | 👩‍🎨 |
| Mike QA | 43 | Mike QA Board | 🧪 |
| Richard | 44 | Richard Board | 📚 |
| Nolan | 45 | Nolan Board | ⚙️ |
| Elsa | 46 | Elsa Board | 📢 |

## How to Run

### Development Server
```bash
cd ~/tools/clawdeck/nodejs/frontend
npm run dev
```

**Will start on**: http://localhost:3002
**API proxy**: `/api` → `http://localhost:3001`

### Build for Production
```bash
cd ~/tools/clawdeck/nodejs/frontend
npm run build
```

### Preview Production Build
```bash
cd ~/tools/clawdeck/nodejs/frontend
npm run preview
```

## Configuration Files

### Vite Config (`vite.config.js`)
```javascript
server: {
  port: 3002,
  host: true,
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true
    }
  }
}
```

### API Credentials
The frontend uses this API token (hardcoded for now):
```
oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039
```

## Next Steps

1. **Resolve Port 3000 Conflict**
   - Stop conflicting service or use port 3002
   - Update documentation with final port

2. **Start Development Server**
   ```bash
   cd ~/tools/clawdeck/nodejs/frontend
   npm run dev
   ```

3. **Test UI Functionality**
   - Verify all boards load correctly
   - Test task creation
   - Test drag-and-drop between columns
   - Test all task actions (assign, claim, complete, delete)
   - Verify API proxy works correctly

4. **Enhancements** (Future)
   - Real-time updates via WebSocket
   - Agent activity feed
   - Task comments/notes
   - File attachments
   - Dark/light theme toggle
   - User authentication

## Files Created

All files are in: `/home/montelai/tools/clawdeck/nodejs/frontend/`

**Configuration:**
- `package.json`
- `vite.config.js`
- `tailwind.config.js`
- `postcss.config.js`
- `index.html`

**Source:**
- `src/main.jsx`
- `src/App.jsx`
- `src/App.css`
- `src/index.css`
- `src/lib/api.js`

**Components:**
- `src/components/Header.jsx` + `Header.css`
- `src/components/KanbanBoard.jsx` + `KanbanBoard.css`
- `src/components/TaskModal.jsx` + `TaskModal.css`
- `src/components/LoadingSpinner.jsx` + `LoadingSpinner.css`

## API Connection

### Backend: ClawDeck Node.js API
- **URL**: `http://localhost:3001/api/v1`
- **Status**: ✅ Running
- **Authentication**: Bearer token

### Endpoints Used
- `GET /boards` - List all boards
- `GET /tasks?board_id=X` - Get tasks for board
- `POST /tasks` - Create task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task
- `PATCH /tasks/:id/assign` - Assign to agent
- `PATCH /tasks/:id/claim` - Claim task
- `PATCH /tasks/:id/complete` - Mark complete

## Technical Notes

### Framework Choice: React + Vite
- Fast HMR for development
- Built-in API proxy for backend calls
- Optimized production builds
- No build step needed for development

### CSS: Tailwind CSS
- Utility-first approach
- Consistent with modern React development
- Easy customization via theme config

### State Management
- React hooks (useState, useEffect)
- Local component state
- No global state management needed (yet)

### Drag and Drop
- HTML5 Drag and Drop API
- Native browser support
- No external libraries required

## Migration Connection

This UI connects to the OpenClaw migration work:

### Phase 1 & 2 (Complete)
- ClawDeck API running ✅
- OpenClaw system user configured ✅
- API token generated ✅

### Phase 3 (Complete)
- Agent boards created ✅
- Board IDs mapped ✅

### Phase 4 (Pending - UI Required)
- This UI provides the visual interface
- Agents can use TaskManager client library
- Real-time task visibility for Jarvis

## Success Criteria

When running, the UI should:
1. ✅ Load all 7 agent boards
2. ✅ Display tasks in kanban columns
3. ✅ Allow creating new tasks
4. ✅ Allow updating task status (drag-drop or buttons)
5. ✅ Show real-time statistics
6. ✅ Work with the OpenClaw agent boards

---

**Document created**: 2026-02-08
**Status**: Frontend built, awaiting server start
**Next**: Start dev server and test functionality
