import { useState, useEffect } from 'react'
import type { Board, Task, TaskStatus } from '../types'
import './TaskModal.css'

type Priority = 'none' | 'low' | 'medium' | 'high'

interface TaskModalProps {
  board: Board
  task: Task | null
  onSave: (taskIdOrData: string | Partial<Task>, data?: Partial<Task>) => void
  onClose: () => void
}

interface FormData {
  name: string
  description: string
  priority: Priority
  status: TaskStatus
  tags: string
}

export default function TaskModal ({ board, task, onSave, onClose }: TaskModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    priority: 'none',
    status: 'inbox',
    tags: '',
  })

  const isEditing = !!task

  useEffect(() => {
    if (task) {
      const extendedTask = task as Task & {
        priority?: Priority
        tags?: string[]
      }
      setFormData({
        name: task.name || '',
        description: task.description || '',
        priority: extendedTask.priority || 'none',
        status: task.status || 'inbox',
        tags: extendedTask.tags?.join(', ') || '',
      })
    }
  }, [task])

  function handleSubmit (e: React.FormEvent) {
    e.preventDefault()

    const data: Partial<Task> & { tags?: string[]; priority?: Priority } = {
      ...formData,
      tags: formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t),
    }

    if (isEditing && task) {
      onSave(task.id, data)
    } else {
      onSave(data)
    }
  }

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div className='modal-content' onClick={(e) => e.stopPropagation()}>
        <div className='modal-header'>
          <h2>{isEditing ? 'Edit Task' : 'New Task'}</h2>
          <button className='modal-close' onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className='modal-body'>
          <div className='form-group'>
            <label htmlFor='task-name'>Task Name *</label>
            <input
              id='task-name'
              type='text'
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder='What needs to be done?'
              required
              autoFocus
            />
          </div>

          <div className='form-group'>
            <label htmlFor='task-description'>Description</label>
            <textarea
              id='task-description'
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder='Add more details...'
              rows={4}
            />
          </div>

          <div className='form-row'>
            <div className='form-group'>
              <label htmlFor='task-priority'>Priority</label>
              <select
                id='task-priority'
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
              >
                <option value='none'>None</option>
                <option value='low'>Low</option>
                <option value='medium'>Medium</option>
                <option value='high'>High</option>
              </select>
            </div>

            <div className='form-group'>
              <label htmlFor='task-status'>Status</label>
              <select
                id='task-status'
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
              >
                <option value='inbox'>Inbox</option>
                <option value='up_next'>Up Next</option>
                <option value='in_progress'>In Progress</option>
                <option value='in_review'>In Review</option>
                <option value='done'>Done</option>
              </select>
            </div>
          </div>

          <div className='form-group'>
            <label htmlFor='task-tags'>Tags (comma-separated)</label>
            <input
              id='task-tags'
              type='text'
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder='e.g., frontend, bug, feature'
            />
          </div>

          <div className='modal-footer'>
            <button type='button' className='btn-secondary' onClick={onClose}>
              Cancel
            </button>
            <button type='submit' className='btn-primary'>
              {isEditing ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
