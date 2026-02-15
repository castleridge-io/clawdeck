import { useState, useEffect } from 'react'
import { getArchivedTasks, unarchiveTask, deleteArchivedTask } from '../lib/api'
import './ArchivePage.css'

const STATUS_LABELS = {
  inbox: 'Inbox',
  up_next: 'Up Next',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export default function ArchivePage ({ boards, onUnarchive }) {
  const [archivedTasks, setArchivedTasks] = useState([])
  const [filteredTasks, setFilteredTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBoardId, setSelectedBoardId] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    loadArchivedTasks()
  }, [selectedBoardId, page])

  useEffect(() => {
    if (selectedBoardId === 'all') {
      setFilteredTasks(archivedTasks)
    } else {
      setFilteredTasks(archivedTasks.filter((task) => task.board_id === selectedBoardId))
    }
  }, [archivedTasks, selectedBoardId])

  async function loadArchivedTasks () {
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

  async function handleUnarchive (taskId) {
    try {
      await unarchiveTask(taskId)
      await loadArchivedTasks()
      if (onUnarchive) {
        onUnarchive()
      }
    } catch (error) {
      window.alert(`Failed to unarchive task: ${error.message}`)
    }
  }

  async function handleDelete (taskId) {
    if (!window.confirm('Are you sure you want to permanently delete this task? This cannot be undone.')) {
      return
    }

    try {
      await deleteArchivedTask(taskId)
      await loadArchivedTasks()
    } catch (error) {
      window.alert(`Failed to delete task: ${error.message}`)
    }
  }

  function formatDate (dateString) {
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

  function getBoardForTask (task) {
    return boards.find((board) => board.id === task.board_id)
  }

  if (loading && archivedTasks.length === 0) {
    return (
      <div className='archive-page'>
        <div className='archive-loading'>
          <div className='archive-spinner' />
          <p>Loading archived tasks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className='archive-page'>
      <div className='archive-header'>
        <div className='archive-header-left'>
          <h1>📦 Archived Tasks</h1>
          <p className='archive-subtitle'>
            {filteredTasks.length} archived task{filteredTasks.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className='archive-controls'>
          <select
            className='archive-filter'
            value={selectedBoardId}
            onChange={(e) => {
              setSelectedBoardId(e.target.value)
              setPage(1)
            }}
          >
            <option value='all'>All Boards</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.icon} {board.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredTasks.length === 0
        ? (
          <div className='archive-empty'>
            <div className='archive-empty-icon'>📦</div>
            <h2>No Archived Tasks</h2>
            <p>Completed tasks will be automatically archived after 24 hours.</p>
          </div>
          )
        : (
          <div className='archive-content'>
            <div className='archive-tasks'>
              {filteredTasks.map((task) => {
                const board = getBoardForTask(task)
                return (
                  <div key={task.id} className='archive-task-card'>
                    <div className='archive-task-header'>
                      <div className='archive-task-board'>
                        {board?.icon} {board?.name}
                      </div>
                      <div className='archive-task-status'>
                        {STATUS_LABELS[task.status] || task.status}
                      </div>
                    </div>

                    <div className='archive-task-body'>
                      <h3 className='archive-task-title'>{task.name || 'Untitled Task'}</h3>
                      {task.description && (
                        <p className='archive-task-description'>{task.description}</p>
                      )}
                    </div>

                    <div className='archive-task-footer'>
                      <div className='archive-task-dates'>
                        <span className='archive-date'>
                          <span className='archive-date-label'>Completed:</span>
                          {formatDate(task.completed_at)}
                        </span>
                        <span className='archive-date'>
                          <span className='archive-date-label'>Archived:</span>
                          {formatDate(task.archived_at)}
                        </span>
                      </div>

                      <div className='archive-task-actions'>
                        <button
                          onClick={() => handleUnarchive(task.id)}
                          className='archive-action-btn unarchive'
                        >
                          ↩️ Restore
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className='archive-action-btn delete'
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className='archive-pagination'>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className='archive-pagination-btn'
                >
                  Previous
                </button>
                <span className='archive-pagination-info'>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className='archive-pagination-btn'
                >
                  Next
                </button>
              </div>
            )}
          </div>
          )}
    </div>
  )
}
