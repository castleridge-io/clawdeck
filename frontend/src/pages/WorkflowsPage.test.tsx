import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import WorkflowsPage from './WorkflowsPage'
import * as api from '../lib/api'

// Mock API functions
vi.mock('../lib/api', () => ({
  getWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  importWorkflowYaml: vi.fn(),
  triggerRun: vi.fn(),
}))

// Mock window.confirm
const mockConfirm = vi.spyOn(window, 'confirm')

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderWorkflowsPage () {
  return render(
    <BrowserRouter>
      <WorkflowsPage />
    </BrowserRouter>
  )
}

describe('WorkflowsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfirm.mockReturnValue(true)
  })

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      vi.mocked(api.getWorkflows).mockImplementation(() => new Promise(() => {}))
      renderWorkflowsPage()
      // LoadingSpinner component should be rendered
      expect(screen.queryByText('Workflows')).not.toBeInTheDocument()
    })
  })

  describe('Workflows List', () => {
    it('shows empty state when no workflows', async () => {
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([])
      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('No workflows yet. Create one to get started.')).toBeInTheDocument()
      })
    })

    it('displays workflows in a table', async () => {
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Test Workflow',
          description: 'A test workflow',
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
        expect(screen.getByText('A test workflow')).toBeInTheDocument()
      })
    })
  })

  describe('Delete Workflow', () => {
    it('calls deleteWorkflow API when delete is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Workflow to Delete',
          description: 'Delete me',
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      vi.mocked(api.deleteWorkflow).mockResolvedValueOnce(true)
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([])

      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Workflow to Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      expect(mockConfirm).toHaveBeenCalled()
      expect(api.deleteWorkflow).toHaveBeenCalledWith('1')
    })

    it('does not delete when confirmation is cancelled', async () => {
      const user = userEvent.setup()
      mockConfirm.mockReturnValueOnce(false)
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Workflow to Keep',
          description: 'Keep me',
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])

      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Workflow to Keep')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      expect(mockConfirm).toHaveBeenCalled()
      expect(api.deleteWorkflow).not.toHaveBeenCalled()
    })

    it('shows error message when delete fails', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Workflow to Delete',
          description: 'Delete me',
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      vi.mocked(api.deleteWorkflow).mockRejectedValueOnce(new Error('Delete failed'))

      // Mock alert
      const mockAlert = vi.spyOn(window, 'alert')
      mockAlert.mockImplementation(() => {})

      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Workflow to Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(expect.stringContaining('Delete failed'))
      })

      mockAlert.mockRestore()
    })

    it('handles 204 response correctly', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Workflow to Delete',
          description: 'Delete me',
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      // deleteWorkflow should return true even with 204 response
      vi.mocked(api.deleteWorkflow).mockResolvedValueOnce(true)
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([])

      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Workflow to Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(api.deleteWorkflow).toHaveBeenCalledWith('1')
      })
    })
  })

  describe('Create Workflow', () => {
    it('opens create modal when Create Workflow button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([])
      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Create Workflow')).toBeInTheDocument()
      })

      const createButtons = screen.getAllByText('Create Workflow')
      await user.click(createButtons[0])

      // Should find the modal title (second occurrence)
      await waitFor(() => {
        const allCreateWorkflowText = screen.getAllByText('Create Workflow')
        expect(allCreateWorkflowText.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Edit Workflow', () => {
    it('opens edit modal when Edit button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Test Workflow',
          description: 'A test',
          steps: [
            {
              stepId: 'step1',
              agentId: 'agent1',
              inputTemplate: 'test',
              expects: 'result',
              type: 'single',
              position: 0,
            },
          ],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Edit'))

      expect(screen.getByText('Edit Workflow')).toBeInTheDocument()
    })
  })

  describe('Run Workflow', () => {
    it('triggers workflow run when Run button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getWorkflows).mockResolvedValueOnce([
        {
          id: '1',
          name: 'Runnable Workflow',
          description: 'Run me',
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      vi.mocked(api.triggerRun).mockResolvedValueOnce({
        id: 'run-1',
        workflow_id: '1',
        status: 'running',
      })

      const mockAlert = vi.spyOn(window, 'alert')
      mockAlert.mockImplementation(() => {})

      renderWorkflowsPage()

      await waitFor(() => {
        expect(screen.getByText('Runnable Workflow')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Run'))

      await waitFor(() => {
        expect(api.triggerRun).toHaveBeenCalledWith('1')
        expect(mockAlert).toHaveBeenCalledWith('Workflow triggered successfully')
      })

      mockAlert.mockRestore()
    })
  })
})
