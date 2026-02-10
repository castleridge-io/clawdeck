import { useState } from 'react'
import { unarchiveTask } from '../lib/api'
import './KanbanBoard.css'

const STATUS_LABELS = {
  inbox: 'Inbox',
  up_next: 'Up Next',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export default function KanbanBoard({ board, tasks, columns, onTaskUpdate, onTaskDelete, onTaskAssign, onTaskClaim, onTaskComplete, onTaskEdit, onUnarchive }) {
  const [draggedTask, setDraggedTask] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  function handleDragStart(task) {
    setDraggedTask(task)
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  function handleDrop(columnId) {
    if (draggedTask && draggedTask.status !== columnId) {
      onTaskUpdate(draggedTask.id, { status: columnId })
    }
    setDraggedTask(null)
  }

  function handleDragEnd() {
    setDraggedTask(null)
  }

  const tasksByColumn = columns.reduce((acc, column) => {
    acc[column.id] = tasks.filter(task => task.status === column.id && !task.archived)
    return acc
  }, {})

  const archivedTasks = tasks.filter(task => task.archived)

  async function handleUnarchiveTask(taskId) {
    try {
      await unarchiveTask(taskId)
      if (onUnarchive) {
        onUnarchive()
      }
    } catch (error) {
      alert(`Failed to unarchive task: ${error.message}`)
    }
  }

  return (
    <div className="kanban-board">
      <div className="kanban-board-header">
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Show archived tasks ({archivedTasks.length})</span>
        </label>
      </div>

      <div className="kanban-columns">
        {columns.map(column => {
          const columnTasks = tasksByColumn[column.id] || []

          return (
            <div
              key={column.id}
              className={`kanban-column kanban-column-${column.id}`}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(column.id)}
            >
              <div className="column-header">
                <div className="column-title">
                  <div className={`column-indicator column-indicator-${column.color}`} />
                  <h3>{column.name}</h3>
                </div>
                <span className="column-count">{columnTasks.length}</span>
              </div>

              <div className="column-tasks">
                {columnTasks.length === 0 ? (
                  <div className="empty-column">
                    <p>No tasks</p>
                    <span className="empty-hint">Drag tasks here or create new ones</span>
                  </div>
                ) : (
                  columnTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={handleDragStart}
                      onEdit={onTaskEdit}
                      onDelete={onTaskDelete}
                      onAssign={onTaskAssign}
                      onClaim={onTaskClaim}
                      onComplete={onTaskComplete}
                      isDragging={draggedTask?.id === task.id}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showArchived && archivedTasks.length > 0 && (
        <div className="archived-tasks-section">
          <div className="archived-tasks-header">
            <h3>📦 Archived Tasks</h3>
            <p className="archived-tasks-subtitle">
              {archivedTasks.length} task{archivedTasks.length !== 1 ? 's' : ''} archived
            </p>
          </div>
          <div className="archived-tasks-list">
            {archivedTasks.map(task => (
              <ArchivedTaskCard
                key={task.id}
                task={task}
                onUnarchive={() => handleUnarchiveTask(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, onDragStart, onEdit, onDelete, onAssign, onClaim, onComplete, isDragging }) {
  const [showActions, setShowActions] = useState(false)

  const priorityColors = {
    none: '#64748b',
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
  }

  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={() => onDragStart(task)}
      onDragEnd={() => {}}
      onClick={() => setShowActions(!showActions)}
    >
      <div className="task-priority" style={{ backgroundColor: priorityColors[task.priority] || priorityColors.none }} />

      <div className="task-content">
        <h4 className="task-title">{task.name}</h4>
        {task.description && (
          <p className="task-description">{task.description}</p>
        )}
      </div>

      <div className="task-meta">
        <div className="task-tags">
          {task.tags?.map(tag => (
            <span key={tag} className="task-tag">{tag}</span>
          ))}
        </div>

        <div className="task-actions">
          {task.assigned_to_agent && (
            <span className="task-badge assigned">✓ Assigned</span>
          )}
          {task.agent_claimed_at && (
            <span className="task-badge claimed">⚡ Active</span>
          )}
        </div>
      </div>

      {showActions && (
        <div className="task-action-buttons" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onEdit(task)}
            className="action-btn edit"
            title="Edit task"
          >
            ✏️ Edit
          </button>

          {!task.assigned_to_agent && (
            <button
              onClick={() => onAssign(task.id)}
              className="action-btn assign"
              title="Assign to agent"
            >
              📋 Assign
            </button>
          )}

          {task.assigned_to_agent && task.status === 'up_next' && (
            <button
              onClick={() => onClaim(task.id)}
              className="action-btn claim"
              title="Claim task"
            >
              ⚡ Claim
            </button>
          )}

          {task.status !== 'done' && (
            <button
              onClick={() => onComplete(task.id)}
              className="action-btn complete"
              title="Mark as done"
            >
              ✅ Complete
            </button>
          )}

          <button
            onClick={() => onDelete(task.id)}
            className="action-btn delete"
            title="Delete task"
          >
            🗑️ Delete
          </button>
        </div>
      )}
    </div>
  )
}

function ArchivedTaskCard({ task, onUnarchive }) {
  const priorityColors = {
    none: '#64748b',
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="archived-task-card">
      <div className="archived-task-priority" style={{ backgroundColor: priorityColors[task.priority] || priorityColors.none }} />
      <div className="archived-task-content">
        <h4 className="archived-task-title">{task.name || 'Untitled Task'}</h4>
        {task.description && (
          <p className="archived-task-description">{task.description}</p>
        )}
        <div className="archived-task-meta">
          <span className="archived-task-status">
            {STATUS_LABELS[task.status] || task.status}
          </span>
          <span className="archived-task-dates">
            Completed: {formatDate(task.completed_at)}
          </span>
        </div>
      </div>
      <button
        onClick={onUnarchive}
        className="archived-task-restore-btn"
        title="Restore this task"
      >
        ↩️ Restore
      </button>
    </div>
  )
}
