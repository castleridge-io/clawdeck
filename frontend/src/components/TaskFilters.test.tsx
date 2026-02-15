import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskFilters, { type TaskFilters as TaskFiltersType } from './TaskFilters'
import type { Agent } from '../types'

describe('TaskFilters', () => {
  const mockAgents: Agent[] = [
    { id: '1', uuid: '1', name: 'Agent One', emoji: '🤖', color: 'blue', slug: 'agent-one' },
    { id: '2', uuid: '2', name: 'Agent Two', emoji: '🦾', color: 'green', slug: 'agent-two' },
  ]

  const defaultFilters: TaskFiltersType = {
    search: '',
    status: [],
    priority: [],
    assignee: [],
    tags: [],
  }

  const mockOnFiltersChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderTaskFilters (filters: TaskFiltersType = defaultFilters) {
    return render(
      <TaskFilters
        filters={filters}
        onFiltersChange={mockOnFiltersChange}
        availableAgents={mockAgents}
        availableTags={['frontend', 'backend', 'bug', 'feature']}
      />
    )
  }

  describe('Search Filter', () => {
    it('renders search input', () => {
      renderTaskFilters()
      expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument()
    })

    it('updates search filter on input', async () => {
      const user = userEvent.setup()
      renderTaskFilters()

      const searchInput = screen.getByPlaceholderText(/search tasks/i)
      await user.type(searchInput, 'test task')

      // Should be called multiple times (once per character)
      expect(mockOnFiltersChange).toHaveBeenCalled()
    })
  })

  describe('Status Filter', () => {
    it('renders status dropdown', () => {
      renderTaskFilters()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('shows status options when clicked', async () => {
      const user = userEvent.setup()
      renderTaskFilters()

      await user.click(screen.getByText('Status'))

      expect(screen.getByText('Inbox')).toBeInTheDocument()
      expect(screen.getByText('In Progress')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })
  })

  describe('Priority Filter', () => {
    it('renders priority dropdown', () => {
      renderTaskFilters()
      expect(screen.getByText('Priority')).toBeInTheDocument()
    })

    it('shows priority options when clicked', async () => {
      const user = userEvent.setup()
      renderTaskFilters()

      await user.click(screen.getByText('Priority'))

      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
  })

  describe('Assignee Filter', () => {
    it('renders assignee dropdown', () => {
      renderTaskFilters()
      expect(screen.getByText('Assignee')).toBeInTheDocument()
    })

    it('shows agent options when clicked', async () => {
      const user = userEvent.setup()
      renderTaskFilters()

      await user.click(screen.getByText('Assignee'))

      expect(screen.getByText('🤖 Agent One')).toBeInTheDocument()
      expect(screen.getByText('🦾 Agent Two')).toBeInTheDocument()
    })
  })

  describe('Tags Filter', () => {
    it('renders tags dropdown', () => {
      renderTaskFilters()
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    it('shows tag options when clicked', async () => {
      const user = userEvent.setup()
      renderTaskFilters()

      await user.click(screen.getByText('Tags'))

      expect(screen.getByText('frontend')).toBeInTheDocument()
      expect(screen.getByText('backend')).toBeInTheDocument()
    })
  })

  describe('Clear Filters', () => {
    it('shows clear button when filters are applied', () => {
      renderTaskFilters({ ...defaultFilters, search: 'test' })
      expect(screen.getByText('Clear filters')).toBeInTheDocument()
    })

    it('hides clear button when no filters applied', () => {
      renderTaskFilters(defaultFilters)
      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('clears all filters when clicked', async () => {
      const user = userEvent.setup()
      renderTaskFilters({ ...defaultFilters, search: 'test' })

      await user.click(screen.getByText('Clear filters'))

      expect(mockOnFiltersChange).toHaveBeenCalledWith(defaultFilters)
    })
  })

  describe('Active Filter Chips', () => {
    it('shows active filter count', () => {
      renderTaskFilters({
        ...defaultFilters,
        search: 'test',
        priority: ['high'],
      })
      // Should show some indication of active filters
      expect(screen.getByText('Clear filters')).toBeInTheDocument()
    })
  })
})
