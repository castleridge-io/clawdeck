import { useState, useEffect } from 'react'
import {
  getBoards,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  assignTask,
  claimTask,
  completeTask,
} from './lib/api'
import { wsClient } from './lib/websocket'
import KanbanBoard from './components/KanbanBoard'
import Header from './components/Header'
import TaskModal from './components/TaskModal'
import LoadingSpinner from './components/LoadingSpinner'
import './App.css'

const AGENTS = [
  { id: 'jarvis-leader', emoji: '👔', name: 'Jarvis Leader', color: 'purple' },
  { id: 'dave-engineer', emoji: '👨‍💻', name: 'Dave Engineer', color: 'blue' },
  { id: 'sally-designer', emoji: '👩‍🎨', name: 'Sally Designer', color: 'pink' },
  { id: 'mike-qa', emoji: '🧪', name: 'Mike QA', color: 'green' },
  { id: 'richard', emoji: '📚', name: 'Richard', color: 'yellow' },
  { id: 'nolan', emoji: '⚙️', name: 'Nolan', color: 'gray' },
  { id: 'elsa', emoji: '📢', name: 'Elsa', color: 'orange' },
]

const COLUMNS = [
  { id: 'inbox', name: 'Inbox', color: 'slate' },
  { id: 'up_next', name: 'Up Next', color: 'blue' },
  { id: 'in_progress', name: 'In Progress', color: 'amber' },
  { id: 'in_review', name: 'In Review', color: 'purple' },
  { id: 'done', name: 'Done', color: 'green' },
]

function App() {
  const [boards, setBoards] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedBoard, setSelectedBoard] = useState(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  useEffect(() => {
    loadData()

    // Get API token from localStorage (set by api.js)
    const token = localStorage.getItem('clawdeck_api_token')

    if (token) {
      // Connect to WebSocket
      wsClient.connect(token)

      // Listen for task events
      wsClient.on('task_event', (message) => {
        console.log('Task event received:', message)
        // Reload data when any task changes
        loadData()
      })

      return () => {
        wsClient.disconnect()
      }
    }
  }, [])

  async function loadData() {
    try {
      setError(null)
      const boardsData = await getBoards().catch(() => [])

      // Filter to OpenClaw agent boards
      const agentBoards = boardsData.filter((board) =>
        AGENTS.some((agent) => board.name.includes(agent.name))
      )

      setBoards(agentBoards)

      // Load tasks for all agent boards
      const allTasksPromises = agentBoards.map((board) =>
        getTasks(board.id)
          .catch(() => [])
          .then((t) => (Array.isArray(t) ? t : []))
      )
      const allTasksData = await Promise.all(allTasksPromises)
      const flatTasks = allTasksData.flat()

      console.log('Loaded boards:', agentBoards.length)
      console.log('Loaded tasks:', flatTasks.length)
      console.log('Sample tasks:', flatTasks.slice(0, 3))

      setAllTasks(flatTasks)
      setLoading(false)

      // Select first board by default
      if (agentBoards.length > 0 && !selectedBoard) {
        setSelectedBoard(agentBoards[0])
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleCreateTask(taskData) {
    try {
      await createTask({
        ...taskData,
        board_id: selectedBoard.id,
      })
      await loadData()
      setShowTaskModal(false)
    } catch (error) {
      alert(`Failed to create task: ${error.message}`)
    }
  }

  async function handleUpdateTask(taskId, updates) {
    try {
      await updateTask(taskId, updates)
      await loadData()
    } catch (error) {
      alert(`Failed to update task: ${error.message}`)
    }
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await deleteTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to delete task: ${error.message}`)
    }
  }

  async function handleAssignTask(taskId) {
    try {
      await assignTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to assign task: ${error.message}`)
    }
  }

  async function handleClaimTask(taskId) {
    try {
      await claimTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to claim task: ${error.message}`)
    }
  }

  async function handleCompleteTask(taskId) {
    try {
      await completeTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to complete task: ${error.message}`)
    }
  }

  const stats = {
    totalBoards: boards.length,
    totalTasks: allTasks.length,
    inbox: allTasks.filter((t) => t.status === 'inbox').length,
    inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
    done: allTasks.filter((t) => t.status === 'done').length,
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='bg-red-500/10 border border-red-500 rounded-lg p-8 text-center'>
          <h2 className='text-xl font-bold text-red-400 mb-2'>⚠️ Error Loading Data</h2>
          <p className='text-red-300 mb-4'>{error}</p>
          <button
            onClick={loadData}
            className='px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg'
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-slate-900'>
      <Header
        stats={stats}
        selectedBoard={selectedBoard}
        onBoardChange={setSelectedBoard}
        boards={boards}
        agents={AGENTS}
        onNewTask={() => setShowTaskModal(true)}
      />

      {selectedBoard && (
        <KanbanBoard
          board={selectedBoard}
          tasks={allTasks.filter((t) => t.board_id === selectedBoard.id)}
          columns={COLUMNS}
          onTaskUpdate={handleUpdateTask}
          onTaskDelete={handleDeleteTask}
          onTaskAssign={handleAssignTask}
          onTaskClaim={handleClaimTask}
          onTaskComplete={handleCompleteTask}
          onTaskEdit={(task) => {
            setEditingTask(task)
            setShowTaskModal(true)
          }}
        />
      )}

      {showTaskModal && (
        <TaskModal
          board={selectedBoard}
          task={editingTask}
          onSave={editingTask ? handleUpdateTask : handleCreateTask}
          onClose={() => {
            setShowTaskModal(false)
            setEditingTask(null)
          }}
        />
      )}
    </div>
  )
}

export default App
