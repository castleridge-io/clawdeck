import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useBoards,
  useAgents,
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useClaimTask,
  useCompleteTask,
} from '../hooks'
import { assignTask } from '../lib/api'
import { wsClient } from '../lib/websocket'
import type { Board, Agent, Task, Column } from '../types'
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

export default function BoardsPage() {
  const queryClient = useQueryClient()
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

  // Fetch boards and agents
  const { data: boardsData = [], isLoading: boardsLoading } = useBoards()
  const { data: agentsData = [], isLoading: agentsLoading } = useAgents()

  // Format agents
  const agents: Agent[] = useMemo(
    () =>
      agentsData.map((agent) => ({
        id: agent.uuid,
        uuid: agent.uuid,
        emoji: agent.emoji,
        name: agent.name,
        color: agent.color,
        slug: agent.slug,
      })),
    [agentsData]
  )

  // Filter boards for agent boards
  const boards = useMemo(
    () =>
      boardsData.filter(
        (board) =>
          board.agent_id || agents.some((agent) => board.name.includes(agent.name))
      ),
    [boardsData, agents]
  )

  // Fetch tasks for all boards using batch query
  const boardIds = boards.map((b) => b.id)
  const { data: allTasks = [], isLoading: tasksLoading } = useTasks(
    boardIds.length > 0 ? { boardIds } : undefined
  )

  // Mutations
  const createTaskMutation = useCreateTask()
  const updateTaskMutation = useUpdateTask()
  const deleteTaskMutation = useDeleteTask()
  const claimTaskMutation = useClaimTask()
  const completeTaskMutation = useCompleteTask()

  // Set first board as selected when data loads
  useEffect(() => {
    if (boards.length > 0 && !selectedBoard) {
      setSelectedBoard(boards[0])
    }
  }, [boards, selectedBoard])

  // WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('clawdeck_jwt_token')
    if (token) {
      wsClient.connect(token)
      wsClient.on('task_event', () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
      })

      return () => {
        wsClient.disconnect()
      }
    }
  }, [queryClient])

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

  async function handleCreateTask(taskData: Partial<Task>) {
    if (!selectedBoard) return

    try {
      await createTaskMutation.mutateAsync({
        ...taskData,
        board_id: selectedBoard.id,
      })
      setShowTaskModal(false)
    } catch (error) {
      alert(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    try {
      await updateTaskMutation.mutateAsync({ id: taskId, data: updates })
    } catch (error) {
      alert(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Wrapper to match TaskModal's onSave signature
  function handleTaskModalSave(taskIdOrData: string | Partial<Task>, data?: Partial<Task>) {
    if (typeof taskIdOrData === 'string') {
      handleUpdateTask(taskIdOrData, data || {})
    } else {
      handleCreateTask(taskIdOrData)
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await deleteTaskMutation.mutateAsync(taskId)
    } catch (error) {
      alert(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleAssignTask(taskId: string) {
    try {
      await assignTask(taskId)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    } catch (error) {
      alert(`Failed to assign task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleClaimTask(taskId: string) {
    try {
      await claimTaskMutation.mutateAsync(taskId)
    } catch (error) {
      alert(`Failed to claim task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleCompleteTask(taskId: string) {
    try {
      await completeTaskMutation.mutateAsync(taskId)
    } catch (error) {
      alert(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const loading = boardsLoading || agentsLoading || tasksLoading

  if (loading) {
    return <LoadingSpinner />
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
          {boards.length > 0 ? (
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
          ) : (
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
          onSave={handleTaskModalSave}
          onClose={() => {
            setShowTaskModal(false)
            setEditingTask(null)
          }}
        />
      )}
    </div>
  )
}
