import { useState, useEffect } from 'react'
import { getBoards, getArchivedTasks, unarchiveTask, deleteArchivedTask } from '../lib/api'
import type { Board, ArchivedTask, TaskStatus } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  up_next: 'Up Next',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export default function ArchivePage() {
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>([])
  const [loading, setLoading] = useState(true)
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    loadBoards()
  }, [])

  useEffect(() => {
    loadArchivedTasks()
  }, [selectedBoardId, page])

  async function loadBoards() {
    try {
      const data = await getBoards()
      setBoards(data)
    } catch (error) {
      console.error('Failed to load boards:', error)
    }
  }

  async function loadArchivedTasks() {
    try {
      setLoading(true)
      const response = await getArchivedTasks({
        board_id: selectedBoardId === 'all' ? undefined : selectedBoardId,
        page,
        limit: 50,
      })

      setArchivedTasks(response.data || [])
      setTotalPages(response.meta?.pages || 1)
    } catch (error) {
      console.error('Failed to load archived tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleUnarchive(taskId: string) {
    try {
      await unarchiveTask(taskId)
      await loadArchivedTasks()
    } catch (error) {
      alert(`Failed to unarchive task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Are you sure you want to permanently delete this task? This cannot be undone.')) {
      return
    }

    try {
      await deleteArchivedTask(taskId)
      await loadArchivedTasks()
    } catch (error) {
      alert(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  function formatDate(dateString?: string) {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getBoardForTask(task: ArchivedTask) {
    return boards.find(board => board.id === task.board_id)
  }

  const filteredTasks = selectedBoardId === 'all'
    ? archivedTasks
    : archivedTasks.filter(task => task.board_id === selectedBoardId)

  if (loading && archivedTasks.length === 0) {
    return (
      <div className="p-6">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Archive</h1>
          <p className="text-slate-400">{filteredTasks.length} archived tasks</p>
        </div>

        <select
          value={selectedBoardId}
          onChange={(e) => {
            setSelectedBoardId(e.target.value)
            setPage(1)
          }}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Boards</option>
          {boards.map(board => (
            <option key={board.id} value={board.id}>
              {board.icon} {board.name}
            </option>
          ))}
        </select>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h2 className="text-xl font-semibold text-white mb-2">No Archived Tasks</h2>
          <p className="text-slate-400">Completed tasks will be automatically archived after 24 hours.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {filteredTasks.map(task => {
              const board = getBoardForTask(task)
              return (
                <div key={task.id} className="bg-slate-800 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-slate-400">{board?.icon} {board?.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          task.status === 'done' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {STATUS_LABELS[task.status] || task.status}
                        </span>
                      </div>
                      <h3 className="text-white font-medium mb-1">{task.name || 'Untitled Task'}</h3>
                      {task.description && (
                        <p className="text-sm text-slate-400">{task.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span>Completed: {formatDate(task.completed_at)}</span>
                        <span>Archived: {formatDate(task.archived_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUnarchive(task.id)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg"
              >
                Previous
              </button>
              <span className="text-slate-400">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
