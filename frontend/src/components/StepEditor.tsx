import { useState, useEffect } from 'react'
import type { WorkflowStep } from '../types'

interface StepEditorProps {
  steps: WorkflowStep[]
  onChange: (steps: WorkflowStep[]) => void
}

const STEP_TYPES = ['single', 'loop', 'approval'] as const

export default function StepEditor ({ steps, onChange }: StepEditorProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  // Reset expanded step if it becomes invalid (when steps are added/removed)
  useEffect(() => {
    if (expandedStep !== null && expandedStep >= steps.length) {
      setExpandedStep(null)
    }
  }, [expandedStep, steps.length])

  function addStep () {
    const newStep: WorkflowStep = {
      stepId: `step_${Date.now()}`,
      name: '',
      agentId: '',
      inputTemplate: '',
      expects: '',
      type: 'single',
      position: steps.length,
    }
    onChange([...steps, newStep])
    setExpandedStep(steps.length)
  }

  function removeStep (index: number) {
    const updated = steps.filter((_, i) => i !== index)
    // Update positions
    onChange(updated.map((step, i) => ({ ...step, position: i })))
    if (expandedStep === index) {
      setExpandedStep(null)
    }
  }

  function moveStep (index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === steps.length - 1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    // Immutable swap
    const updated = steps.map((step, i) => {
      if (i === index) return { ...steps[newIndex], position: index }
      if (i === newIndex) return { ...steps[index], position: newIndex }
      return step
    })
    onChange(updated)
  }

  function updateStep (
    index: number,
    field: keyof WorkflowStep,
    value: string | Record<string, unknown>
  ) {
    const updated = [...steps]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  function parseLoopConfig (configStr: string): Record<string, unknown> | null {
    if (!configStr.trim()) return null
    try {
      return JSON.parse(configStr)
    } catch {
      return null
    }
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-medium text-white'>Steps</h3>
        <button
          type='button'
          onClick={addStep}
          className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg'
        >
          + Add Step
        </button>
      </div>

      {steps.length === 0
        ? (
          <p className='text-slate-400 text-sm py-4 text-center border border-dashed border-slate-600 rounded-lg'>
            No steps defined. Click "Add Step" to create one.
          </p>
          )
        : (
          <div className='space-y-2'>
            {steps.map((step, index) => (
              <div key={step.stepId} className='bg-slate-700 rounded-lg overflow-hidden'>
                {/* Step Header */}
                <div
                  className='flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-600/50'
                  onClick={() => setExpandedStep(expandedStep === index ? null : index)}
                >
                  <div className='flex items-center gap-3'>
                    <span className='text-slate-400 text-sm'>#{index + 1}</span>
                    <span className='text-white font-medium'>{step.name || step.stepId}</span>
                    <span className='px-2 py-0.5 bg-slate-600 text-slate-300 text-xs rounded'>
                      {step.type}
                    </span>
                    <span className='text-slate-400 text-sm'>Agent: {step.agentId || 'Not set'}</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        moveStep(index, 'up')
                      }}
                      disabled={index === 0}
                      className='text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
                      title='Move up'
                    >
                      ↑
                    </button>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        moveStep(index, 'down')
                      }}
                      disabled={index === steps.length - 1}
                      className='text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
                      title='Move down'
                    >
                      ↓
                    </button>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        removeStep(index)
                      }}
                      className='text-red-400 hover:text-red-300'
                      title='Delete step'
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Step Details (Expanded) */}
                {expandedStep === index && (
                  <div className='border-t border-slate-600 p-4 space-y-4'>
                    <div className='grid grid-cols-2 gap-4'>
                      <div>
                        <label className='block text-sm text-slate-400 mb-1'>Step ID</label>
                        <input
                          type='text'
                          value={step.stepId}
                          onChange={(e) => updateStep(index, 'stepId', e.target.value)}
                          className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                          placeholder='unique-step-id'
                          aria-label='Step ID'
                        />
                      </div>
                      <div>
                        <label className='block text-sm text-slate-400 mb-1'>Name</label>
                        <input
                          type='text'
                          value={step.name || ''}
                          onChange={(e) => updateStep(index, 'name', e.target.value)}
                          className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                          placeholder='Display name'
                          aria-label='Name'
                        />
                      </div>
                    </div>

                    <div className='grid grid-cols-2 gap-4'>
                      <div>
                        <label className='block text-sm text-slate-400 mb-1'>Agent ID</label>
                        <input
                          type='text'
                          value={step.agentId}
                          onChange={(e) => updateStep(index, 'agentId', e.target.value)}
                          className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                          placeholder='agent-slug'
                        />
                      </div>
                      <div>
                        <label className='block text-sm text-slate-400 mb-1'>Type</label>
                        <select
                          value={step.type}
                          onChange={(e) => updateStep(index, 'type', e.target.value)}
                          className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                          aria-label='Type'
                        >
                          {STEP_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className='block text-sm text-slate-400 mb-1'>Input Template</label>
                      <textarea
                        value={step.inputTemplate}
                        onChange={(e) => updateStep(index, 'inputTemplate', e.target.value)}
                        className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500'
                        rows={4}
                        placeholder='Template with {{variables}}'
                      />
                    </div>

                    <div>
                      <label className='block text-sm text-slate-400 mb-1'>Expects</label>
                      <input
                        type='text'
                        value={step.expects}
                        onChange={(e) => updateStep(index, 'expects', e.target.value)}
                        className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                        placeholder='Expected output variable name'
                      />
                    </div>

                    {step.type === 'loop' && (
                      <div>
                        <label className='block text-sm text-slate-400 mb-1'>
                          Loop Config (JSON)
                        </label>
                        <textarea
                          value={step.loopConfig ? JSON.stringify(step.loopConfig, null, 2) : ''}
                          onChange={(e) => {
                            const parsed = parseLoopConfig(e.target.value)
                            if (parsed !== null) {
                              updateStep(index, 'loopConfig', parsed)
                            } else {
                              updateStep(index, 'loopConfig', '' as string)
                            }
                          }}
                          className='w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500'
                          rows={3}
                          placeholder='{"over": "items", "var": "item"}'
                          aria-label='Loop Config (JSON)'
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
    </div>
  )
}
