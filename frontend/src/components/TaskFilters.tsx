import { useState, useRef, useEffect } from 'react'
import type { Agent, TaskStatus, Task } from '../types'

export interface TaskFilters {
  search: string
  status: TaskStatus[]
  priority: string[]
  assignee: string[]
  tags: string[]
}

interface TaskFiltersProps {
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  availableAgents: Agent[]
  availableTags: string[]
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'up_next', label: 'Up Next' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', color: 'bg-red-500' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-500' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'none', label: 'None', color: 'bg-slate-500' },
]

export function filterTasks (tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const nameMatch = task.name?.toLowerCase().includes(searchLower)
      const descMatch = task.description?.toLowerCase().includes(searchLower)
      if (!nameMatch && !descMatch) return false
    }

    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(task.status)) {
      return false
    }

    // Priority filter
    if (filters.priority.length > 0) {
      const extendedTask = task as Task & { priority?: string }
      if (!filters.priority.includes(extendedTask.priority || 'none')) {
        return false
      }
    }

    // Assignee filter
    if (filters.assignee.length > 0) {
      const extendedTask = task as Task & { assignee_id?: string; claimed_by?: string }
      const taskAssignee = extendedTask.assignee_id || extendedTask.claimed_by
      if (!taskAssignee || !filters.assignee.includes(taskAssignee)) {
        return false
      }
    }

    // Tags filter
    if (filters.tags.length > 0) {
      const extendedTask = task as Task & { tags?: string[] }
      const taskTags = extendedTask.tags || []
      if (!filters.tags.some((tag) => taskTags.includes(tag))) {
        return false
      }
    }

    return true
  })
}

function hasActiveFilters (filters: TaskFilters): boolean {
  return (
    filters.search !== '' ||
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.assignee.length > 0 ||
    filters.tags.length > 0
  )
}

interface DropdownProps {
  label: string
  isOpen: boolean
  onToggle: () => void
  selectedCount: number
  children: React.ReactNode
}

function Dropdown ({ label, isOpen, onToggle, selectedCount, children }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside (event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        if (isOpen) onToggle()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onToggle])

  return (
    <div className='relative' ref={ref}>
      <button
        type='button'
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
          selectedCount > 0
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50'
            : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
        }`}
      >
        {label}
        {selectedCount > 0 && (
          <span className='bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full'>
            {selectedCount}
          </span>
        )}
        <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
        </svg>
      </button>
      {isOpen && (
        <div className='absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[180px] py-1'>
          {children}
        </div>
      )}
    </div>
  )
}

interface CheckboxOptionProps {
  label: string
  checked: boolean
  onChange: () => void
  color?: string
}

function CheckboxOption ({ label, checked, onChange, color }: CheckboxOptionProps) {
  return (
    <label className='flex items-center gap-2 px-3 py-2 hover:bg-slate-700 cursor-pointer'>
      <input
        type='checkbox'
        checked={checked}
        onChange={onChange}
        className='w-4 h-4 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500'
      />
      {color && <span className={`w-3 h-3 rounded-full ${color}`} />}
      <span className='text-slate-200 text-sm'>{label}</span>
    </label>
  )
}

export default function TaskFiltersComponent ({
  filters,
  onFiltersChange,
  availableAgents,
  availableTags,
}: TaskFiltersProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  function toggleDropdown (name: string) {
    setOpenDropdown(openDropdown === name ? null : name)
  }

  function updateFilter<K extends keyof TaskFilters> (key: K, value: TaskFilters[K]) {
    onFiltersChange({ ...filters, [key]: value })
  }

  function toggleArrayFilter<K extends 'status' | 'priority' | 'assignee' | 'tags'> (
    key: K,
    value: string
  ) {
    const current = filters[key]
    const updated = (current as string[]).includes(value)
      ? (current as string[]).filter((v) => v !== value)
      : [...(current as string[]), value]
    updateFilter(key, updated as TaskFilters[K])
  }

  function clearFilters () {
    onFiltersChange({
      search: '',
      status: [],
      priority: [],
      assignee: [],
      tags: [],
    })
  }

  const showClear = hasActiveFilters(filters)

  return (
    <div className='flex flex-wrap items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700'>
      {/* Search */}
      <div className='relative flex-1 min-w-[200px] max-w-md'>
        <svg
          className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
          />
        </svg>
        <input
          type='text'
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          placeholder='Search tasks...'
          className='w-full pl-10 pr-4 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
        />
      </div>

      {/* Status Filter */}
      <Dropdown
        label='Status'
        isOpen={openDropdown === 'status'}
        onToggle={() => toggleDropdown('status')}
        selectedCount={filters.status.length}
      >
        {STATUS_OPTIONS.map((option) => (
          <CheckboxOption
            key={option.value}
            label={option.label}
            checked={filters.status.includes(option.value)}
            onChange={() => toggleArrayFilter('status', option.value)}
          />
        ))}
      </Dropdown>

      {/* Priority Filter */}
      <Dropdown
        label='Priority'
        isOpen={openDropdown === 'priority'}
        onToggle={() => toggleDropdown('priority')}
        selectedCount={filters.priority.length}
      >
        {PRIORITY_OPTIONS.map((option) => (
          <CheckboxOption
            key={option.value}
            label={option.label}
            checked={filters.priority.includes(option.value)}
            onChange={() => toggleArrayFilter('priority', option.value)}
            color={option.color}
          />
        ))}
      </Dropdown>

      {/* Assignee Filter */}
      <Dropdown
        label='Assignee'
        isOpen={openDropdown === 'assignee'}
        onToggle={() => toggleDropdown('assignee')}
        selectedCount={filters.assignee.length}
      >
        {availableAgents.length === 0
          ? (
            <div className='px-3 py-2 text-slate-400 text-sm'>No agents available</div>
            )
          : (
              availableAgents.map((agent) => (
                <CheckboxOption
                  key={agent.id}
                  label={`${agent.emoji} ${agent.name}`}
                  checked={filters.assignee.includes(agent.id)}
                  onChange={() => toggleArrayFilter('assignee', agent.id)}
                />
              ))
            )}
      </Dropdown>

      {/* Tags Filter */}
      <Dropdown
        label='Tags'
        isOpen={openDropdown === 'tags'}
        onToggle={() => toggleDropdown('tags')}
        selectedCount={filters.tags.length}
      >
        {availableTags.length === 0
          ? (
            <div className='px-3 py-2 text-slate-400 text-sm'>No tags available</div>
            )
          : (
              availableTags.map((tag) => (
                <CheckboxOption
                  key={tag}
                  label={tag}
                  checked={filters.tags.includes(tag)}
                  onChange={() => toggleArrayFilter('tags', tag)}
                />
              ))
            )}
      </Dropdown>

      {/* Clear Button */}
      {showClear && (
        <button
          type='button'
          onClick={clearFilters}
          className='px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors'
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
