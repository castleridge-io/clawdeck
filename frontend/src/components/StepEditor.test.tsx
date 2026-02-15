import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import StepEditor from './StepEditor'
import type { WorkflowStep } from '../types'

describe('StepEditor', () => {
  const mockOnChange = vi.fn()
  const defaultSteps: WorkflowStep[] = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderStepEditor (initialSteps: WorkflowStep[] = defaultSteps) {
    // Use a wrapper to manage state so re-renders happen
    function StepEditorWrapper () {
      const [steps, setSteps] = useState(initialSteps)
      return (
        <StepEditor
          steps={steps}
          onChange={(newSteps) => {
            setSteps(newSteps)
            mockOnChange(newSteps)
          }}
        />
      )
    }
    return render(<StepEditorWrapper />)
  }

  describe('Empty State', () => {
    it('shows empty state when no steps', () => {
      renderStepEditor([])
      expect(
        screen.getByText('No steps defined. Click "Add Step" to create one.')
      ).toBeInTheDocument()
    })

    it('shows Add Step button', () => {
      renderStepEditor([])
      expect(screen.getByText('+ Add Step')).toBeInTheDocument()
    })
  })

  describe('Adding Steps', () => {
    it('adds a new step when Add Step is clicked', async () => {
      const user = userEvent.setup()
      renderStepEditor([])

      await user.click(screen.getByText('+ Add Step'))

      expect(mockOnChange).toHaveBeenCalledTimes(1)
      const calls = mockOnChange.mock.calls
      const newSteps = calls[calls.length - 1]?.[0] ?? []
      expect(newSteps).toHaveLength(1)
      expect(newSteps[0]).toHaveProperty('stepId')
      expect(newSteps[0]).toHaveProperty('type', 'single')
      expect(newSteps[0]).toHaveProperty('position', 0)
    })

    it('expands the new step after adding', async () => {
      const user = userEvent.setup()
      renderStepEditor([])

      await user.click(screen.getByText('+ Add Step'))

      // After adding, the step details should be visible (expanded)
      // The new step should have the stepId field visible
      const stepIdInput = await screen.findByLabelText('Step ID', {}, { timeout: 2000 })
      expect(stepIdInput).toBeInTheDocument()
    })
  })

  describe('Displaying Steps', () => {
    const sampleSteps: WorkflowStep[] = [
      {
        stepId: 'step-1',
        name: 'First Step',
        agentId: 'agent-1',
        inputTemplate: 'Template 1',
        expects: 'result1',
        type: 'single',
        position: 0,
      },
      {
        stepId: 'step-2',
        name: 'Second Step',
        agentId: 'agent-2',
        inputTemplate: 'Template 2',
        expects: 'result2',
        type: 'approval',
        position: 1,
      },
    ]

    it('displays all steps', () => {
      renderStepEditor(sampleSteps)
      expect(screen.getByText('First Step')).toBeInTheDocument()
      expect(screen.getByText('Second Step')).toBeInTheDocument()
    })

    it('displays step numbers', () => {
      renderStepEditor(sampleSteps)
      expect(screen.getByText('#1')).toBeInTheDocument()
      expect(screen.getByText('#2')).toBeInTheDocument()
    })

    it('displays step types', () => {
      renderStepEditor(sampleSteps)
      expect(screen.getByText('single')).toBeInTheDocument()
      expect(screen.getByText('approval')).toBeInTheDocument()
    })

    it('displays agent IDs', () => {
      renderStepEditor(sampleSteps)
      expect(screen.getByText('Agent: agent-1')).toBeInTheDocument()
      expect(screen.getByText('Agent: agent-2')).toBeInTheDocument()
    })
  })

  describe('Expanding/Collapsing Steps', () => {
    const sampleStep: WorkflowStep = {
      stepId: 'step-1',
      name: 'Test Step',
      agentId: 'agent-1',
      inputTemplate: 'Test template',
      expects: 'result',
      type: 'single',
      position: 0,
    }

    it('expands step when clicked', async () => {
      const user = userEvent.setup()
      renderStepEditor([sampleStep])

      // Initially collapsed - form fields not visible
      expect(screen.queryByLabelText('Step ID')).not.toBeInTheDocument()

      await user.click(screen.getByText('Test Step'))

      // Now expanded - form fields visible
      await waitFor(() => {
        expect(screen.getByLabelText('Step ID')).toBeInTheDocument()
      })
    })

    it('collapses step when clicked again', async () => {
      const user = userEvent.setup()
      renderStepEditor([sampleStep])

      await user.click(screen.getByText('Test Step'))
      await waitFor(() => {
        expect(screen.getByLabelText('Step ID')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Test Step'))
      await waitFor(() => {
        expect(screen.queryByLabelText('Step ID')).not.toBeInTheDocument()
      })
    })
  })

  describe('Editing Steps', () => {
    const sampleStep: WorkflowStep = {
      stepId: 'step-1',
      name: 'Test Step',
      agentId: 'agent-1',
      inputTemplate: 'Test template',
      expects: 'result',
      type: 'single',
      position: 0,
    }

    it('updates step ID', async () => {
      const user = userEvent.setup()
      renderStepEditor([sampleStep])

      await user.click(screen.getByText('Test Step'))
      const input = await screen.findByLabelText('Step ID')

      // Use fireEvent to directly change the value (more reliable than clear+type)
      fireEvent.change(input, { target: { value: 'new-step-id' } })

      expect(mockOnChange).toHaveBeenCalled()
      const calls = mockOnChange.mock.calls
      const updatedSteps = calls[calls.length - 1]?.[0] ?? []
      expect(updatedSteps[0].stepId).toBe('new-step-id')
    })

    it('updates step name', async () => {
      const user = userEvent.setup()
      renderStepEditor([sampleStep])

      await user.click(screen.getByText('Test Step'))
      const input = await screen.findByLabelText('Name')

      // Use fireEvent to directly change the value
      fireEvent.change(input, { target: { value: 'New Name' } })

      expect(mockOnChange).toHaveBeenCalled()
      const calls = mockOnChange.mock.calls
      const updatedSteps = calls[calls.length - 1]?.[0] ?? []
      expect(updatedSteps[0].name).toBe('New Name')
    })

    it('updates step type', async () => {
      const user = userEvent.setup()
      renderStepEditor([sampleStep])

      await user.click(screen.getByText('Test Step'))
      await waitFor(() => {
        expect(screen.getByLabelText('Type')).toBeInTheDocument()
      })
      const select = screen.getByLabelText('Type')
      await user.selectOptions(select, 'approval')

      expect(mockOnChange).toHaveBeenCalled()
      const calls = mockOnChange.mock.calls
      const updatedSteps = calls[calls.length - 1]?.[0] ?? []
      expect(updatedSteps[0].type).toBe('approval')
    })

    it('shows loop config field when type is loop', async () => {
      const user = userEvent.setup()
      const loopStep = { ...sampleStep, type: 'loop' as const }
      renderStepEditor([loopStep])

      await user.click(screen.getByText('Test Step'))
      const loopConfigInput = await screen.findByLabelText('Loop Config (JSON)', {}, { timeout: 2000 })
      expect(loopConfigInput).toBeInTheDocument()
    })

    it('hides loop config field when type is not loop', async () => {
      const user = userEvent.setup()
      renderStepEditor([sampleStep])

      await user.click(screen.getByText('Test Step'))
      expect(screen.queryByLabelText('Loop Config (JSON)')).not.toBeInTheDocument()
    })
  })

  describe('Removing Steps', () => {
    const sampleSteps: WorkflowStep[] = [
      {
        stepId: 'step-1',
        name: 'First Step',
        agentId: 'agent-1',
        inputTemplate: 'Template 1',
        expects: 'result1',
        type: 'single',
        position: 0,
      },
      {
        stepId: 'step-2',
        name: 'Second Step',
        agentId: 'agent-2',
        inputTemplate: 'Template 2',
        expects: 'result2',
        type: 'single',
        position: 1,
      },
    ]

    it('removes step when delete button is clicked', async () => {
      const user = userEvent.setup()
      renderStepEditor(sampleSteps)

      const deleteButtons = screen.getAllByTitle('Delete step')
      await user.click(deleteButtons[0])

      expect(mockOnChange).toHaveBeenCalled()
      const updatedSteps = mockOnChange.mock.calls[0][0]
      expect(updatedSteps).toHaveLength(1)
      expect(updatedSteps[0].stepId).toBe('step-2')
    })

    it('updates positions after removing a step', async () => {
      const user = userEvent.setup()
      renderStepEditor(sampleSteps)

      const deleteButtons = screen.getAllByTitle('Delete step')
      await user.click(deleteButtons[0])

      const updatedSteps = mockOnChange.mock.calls[0][0]
      expect(updatedSteps[0].position).toBe(0)
    })
  })

  describe('Reordering Steps', () => {
    const sampleSteps: WorkflowStep[] = [
      {
        stepId: 'step-1',
        name: 'First Step',
        agentId: 'agent-1',
        inputTemplate: 'Template 1',
        expects: 'result1',
        type: 'single',
        position: 0,
      },
      {
        stepId: 'step-2',
        name: 'Second Step',
        agentId: 'agent-2',
        inputTemplate: 'Template 2',
        expects: 'result2',
        type: 'single',
        position: 1,
      },
      {
        stepId: 'step-3',
        name: 'Third Step',
        agentId: 'agent-3',
        inputTemplate: 'Template 3',
        expects: 'result3',
        type: 'single',
        position: 2,
      },
    ]

    it('moves step up', async () => {
      const user = userEvent.setup()
      renderStepEditor(sampleSteps)

      const moveUpButtons = screen.getAllByTitle('Move up')
      await user.click(moveUpButtons[1]) // Move second step up

      const updatedSteps = mockOnChange.mock.calls[0][0]
      expect(updatedSteps[0].stepId).toBe('step-2')
      expect(updatedSteps[1].stepId).toBe('step-1')
    })

    it('moves step down', async () => {
      const user = userEvent.setup()
      renderStepEditor(sampleSteps)

      const moveDownButtons = screen.getAllByTitle('Move down')
      await user.click(moveDownButtons[0]) // Move first step down

      const updatedSteps = mockOnChange.mock.calls[0][0]
      expect(updatedSteps[0].stepId).toBe('step-2')
      expect(updatedSteps[1].stepId).toBe('step-1')
    })

    it('disables move up on first step', () => {
      renderStepEditor(sampleSteps)
      const moveUpButtons = screen.getAllByTitle('Move up')
      expect(moveUpButtons[0]).toBeDisabled()
    })

    it('disables move down on last step', () => {
      renderStepEditor(sampleSteps)
      const moveDownButtons = screen.getAllByTitle('Move down')
      expect(moveDownButtons[moveDownButtons.length - 1]).toBeDisabled()
    })

    it('updates positions after reordering', async () => {
      const user = userEvent.setup()
      renderStepEditor(sampleSteps)

      const moveDownButtons = screen.getAllByTitle('Move down')
      await user.click(moveDownButtons[0])

      const updatedSteps = mockOnChange.mock.calls[0][0]
      expect(updatedSteps[0].position).toBe(0)
      expect(updatedSteps[1].position).toBe(1)
      expect(updatedSteps[2].position).toBe(2)
    })
  })
})
