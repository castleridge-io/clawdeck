import { useState, useMemo } from 'react'
import { useBoards, useTasks, useAgents, useUpdateTask, useDeleteTask } from '../hooks'
import { useQueryClient } from '@tanstack/react-query'
import type { TaskStatus } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

const STATUS_OPTIONS: { value: TaskStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'up_next', label: 'Up Next' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
]

export default function TasksPage () {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [boardFilter, setBoardFilter] = useState<string>('')
  const queryClient = useQueryClient()

  // Fetch boards and agents
  const { data: boards = [], isLoading: boardsLoading } = useBoards()
  const { data: agentsData = [], isLoading: agentsLoading } = useAgents()

  // Format agents for dropdown
  const agents = useMemo(() => {
    return agentsData.map((agent) => ({
      id: agent.uuid,
      name: agent.name,
      emoji: agent.emoji,
    }))
  }, [agentsData])

  // Fetch tasks for all boards using batch query
  const boardIds = boards.map((b) => b.id)
  const { data: allTasks = [], isLoading: tasksLoading } = useTasks(
    boardIds.length > 0 ? { boardIds } : undefined
  )

  // Mutations
  const updateTaskMutation = useUpdateTask()
  const deleteTaskMutation = useDeleteTask()

  // Filter tasks client-side
  const tasks = useMemo(() => {
    let filtered = allTasks
    if (statusFilter) {
      filtered = filtered.filter((t) => t.status === statusFilter)
    }
    if (boardFilter) {
      filtered = filtered.filter((t) => t.board_id === boardFilter)
    }
    return filtered
  }, [allTasks, statusFilter, boardFilter])

  async function handleStatusChange (taskId: string, status: TaskStatus) {
    try {
      await updateTaskMutation.mutateAsync({ id: taskId, data: { status } })
    } catch (error) {
      alert(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleAssigneeChange (taskId: string, assigneeId: string) {
    try {
      await updateTaskMutation.mutateAsync({
        id: taskId,
        data: { assignee_id: assigneeId || undefined },
      })
    } catch (error) {
      alert(`Failed to update assignee: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleDelete (taskId: string) {
    const confirmed = window.confirm('Are you sure you want to delete this task?')
    if (!confirmed) return

    try {
      await deleteTaskMutation.mutateAsync(taskId)
    } catch (error) {
      alert(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  function handleRefresh () {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['boards'] })
  }

  function getBoardName (boardId: string) {
    return boards.find((b) => b.id === boardId)?.name || 'Unknown'
  }

  function formatDate (dateString?: string) {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  const loading = boardsLoading || tasksLoading || agentsLoading

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold text-white'>Tasks</h1>

        <div className='flex gap-4'>
          <button
            onClick={handleRefresh}
            className='px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white flex items-center gap-2'
          >
            <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
            </svg>
            Refresh
          </button>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
            className='px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
            className='px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
          >
            <option value=''>All Boards</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className='bg-slate-800 rounded-lg overflow-hidden'>
        {tasks.length === 0
          ? (
            <div className='text-center py-12 text-slate-400'>No tasks found</div>
            )
          : (
            <table className='w-full'>
              <thead className='bg-slate-700'>
                <tr>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Task</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Board</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Assignee</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Status</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Created</th>
                  <th className='text-right px-4 py-3 text-slate-300 font-medium'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-700'>
                {tasks.map((task) => (
                  <tr key={task.id} className='hover:bg-slate-700/50'>
                    <td className='px-4 py-3 text-white'>{task.name || 'Untitled'}</td>
                    <td className='px-4 py-3 text-slate-300'>{getBoardName(task.board_id)}</td>
                    <td className='px-4 py-3'>
                      <select
                        value={task.assignee_id || ''}
                        onChange={(e) => handleAssigneeChange(task.id, e.target.value)}
                        className='bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm text-white min-w-[120px]'
                      >
                        <option value=''>Unassigned</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.emoji} {agent.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className='px-4 py-3'>
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                        className='bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm text-white'
                      >
                        {STATUS_OPTIONS.filter((o) => o.value).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className='px-4 py-3 text-slate-400'>{formatDate(task.created_at)}</td>
                    <td className='px-4 py-3 text-right'>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className='text-red-400 hover:text-red-300 text-sm'
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
      </div>
    </div>
  )
}
