import { useState, useEffect, useMemo } from 'react'
import {
  getBoards,
  getAgents,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  assignTask,
  claimTask,
  completeTask,
} from '../lib/api'
import { wsClient } from '../lib/websocket'
import type { Board, Agent, Task, Column, TaskStatus } from '../types'
import KanbanBoard from '../components/KanbanBoard'
import TaskModal from '../components/TaskModal'
import TaskFilters, {
  type TaskFilters as TaskFiltersType,
  filterTasks,
} from '../components/TaskFilters'
import LoadingSpinner from '../components/LoadingSpinner'

const COLUMNS: Column[] = [
  { id: 'inbox', name: 'Inbox', color: 'slate' },
  { id: 'up_next', name: 'Up Next', color: 'blue' },
  { id: 'in_progress', name: 'In Progress', color: 'amber' },
  { id: 'in_review', name: 'In Review', color: 'purple' },
  { id: 'done', name: 'Done', color: 'green' },
]

export default function BoardsPage () {
  const [boards, setBoards] = useState<Board[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [filters, setFilters] = useState<TaskFiltersType>({
    search: '',
    status: [],
    priority: [],
    assignee: [],
    tags: [],
  })

  // Extract available tags from all tasks
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    allTasks.forEach((task) => {
      const extendedTask = task as Task & { tags?: string[] }
      extendedTask.tags?.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [allTasks])

  // Filter tasks for the selected board
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return []
    const boardTasks = allTasks.filter((t) => t.board_id === selectedBoard.id)
    return filterTasks(boardTasks, filters)
  }, [selectedBoard, allTasks, filters])

  useEffect(() => {
    loadData()

    const token = localStorage.getItem('clawdeck_jwt_token')
    if (token) {
      wsClient.connect(token)
      wsClient.on('task_event', () => {
        loadData()
      })

      return () => {
        wsClient.disconnect()
      }
    }
  }, [])

  async function loadData () {
    try {
      setError(null)

      const [agentsData, boardsData] = await Promise.all([
        getAgents().catch((): Agent[] => []),
        getBoards().catch((): Board[] => []),
      ])

      const formattedAgents: Agent[] = agentsData.map((agent) => ({
        id: agent.uuid,
        uuid: agent.uuid,
        emoji: agent.emoji,
        name: agent.name,
        color: agent.color,
        slug: agent.slug,
      }))
      setAgents(formattedAgents)

      const agentBoards = boardsData.filter(
        (board) =>
          board.agent_id || formattedAgents.some((agent) => board.name.includes(agent.name))
      )

      setBoards(agentBoards)

      const allTasksPromises = agentBoards.map((board) =>
        getTasks(board.id)
          .catch((): Task[] => [])
          .then((t) => (Array.isArray(t) ? t : []))
      )
      const allTasksData = await Promise.all(allTasksPromises)
      const flatTasks = allTasksData.flat()

      setAllTasks(flatTasks)
      setLoading(false)

      if (agentBoards.length > 0 && !selectedBoard) {
        setSelectedBoard(agentBoards[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      setLoading(false)
    }
  }

  async function handleCreateTask (taskData: Partial<Task>) {
    if (!selectedBoard) return

    try {
      await createTask({
        ...taskData,
        board_id: selectedBoard.id,
      })
      await loadData()
      setShowTaskModal(false)
    } catch (error) {
      alert(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleUpdateTask (taskId: string, updates: Partial<Task>) {
    try {
      await updateTask(taskId, updates)
      await loadData()
    } catch (error) {
      alert(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleDeleteTask (taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await deleteTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleAssignTask (taskId: string) {
    try {
      await assignTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to assign task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleClaimTask (taskId: string) {
    try {
      await claimTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to claim task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleCompleteTask (taskId: string) {
    try {
      await completeTask(taskId)
      await loadData()
    } catch (error) {
      alert(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (error) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='bg-red-500/10 border border-red-500 rounded-lg p-8 text-center'>
          <h2 className='text-xl font-bold text-red-400 mb-2'>Error Loading Data</h2>
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
    <div className='p-6'>
      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold text-white'>Boards</h1>
          <p className='text-slate-400'>Manage your task boards</p>
        </div>

        <div className='flex items-center gap-4'>
          {/* Board Selector */}
          {boards.length > 0
            ? (
              <select
                value={selectedBoard?.id || ''}
                onChange={(e) => {
                  const board = boards.find((b) => b.id === e.target.value)
                  setSelectedBoard(board || null)
                }}
                className='px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
              )
            : (
              <span className='text-slate-400 text-sm'>No boards available</span>
              )}

          <button
            onClick={() => setShowTaskModal(true)}
            disabled={boards.length === 0}
            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2'
          >
            <svg fill='none' viewBox='0 0 24 24' stroke='currentColor' className='w-5 h-5'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 4v16m8-8H4'
              />
            </svg>
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className='mb-4'>
        <TaskFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableAgents={agents}
          availableTags={availableTags}
        />
      </div>

      {/* Kanban Board - always show, even when empty */}
      <KanbanBoard
        board={selectedBoard}
        tasks={filteredTasks}
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

      {/* Task Modal */}
      {showTaskModal && selectedBoard && (
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
