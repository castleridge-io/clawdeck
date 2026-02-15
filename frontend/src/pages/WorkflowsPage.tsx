import { useState, useEffect } from 'react'
import {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  importWorkflowYaml,
  triggerRun,
} from '../lib/api'
import type { Workflow, WorkflowStep } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'
import StepEditor from '../components/StepEditor'

interface EditingWorkflow {
  id?: string
  name: string
  description: string
  steps: WorkflowStep[]
}

export default function WorkflowsPage () {
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<EditingWorkflow | null>(null)
  const [showYamlImport, setShowYamlImport] = useState(false)
  const [yamlInput, setYamlInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadWorkflows()
  }, [])

  async function loadWorkflows () {
    try {
      const data = await getWorkflows()
      setWorkflows(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load workflows:', error)
    } finally {
      setLoading(false)
    }
  }

  function startCreate () {
    setEditingWorkflow({
      name: '',
      description: '',
      steps: [],
    })
    setShowEditor(true)
  }

  function startEdit (workflow: Workflow) {
    setEditingWorkflow({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description || '',
      steps: workflow.steps || [],
    })
    setShowEditor(true)
  }

  function cancelEdit () {
    setShowEditor(false)
    setEditingWorkflow(null)
  }

  async function handleSave () {
    if (!editingWorkflow || !editingWorkflow.name.trim()) return

    setSaving(true)
    try {
      if (editingWorkflow.id) {
        await updateWorkflow(editingWorkflow.id, {
          name: editingWorkflow.name,
          description: editingWorkflow.description,
          steps: editingWorkflow.steps,
        })
      } else {
        await createWorkflow({
          name: editingWorkflow.name,
          description: editingWorkflow.description,
          steps: editingWorkflow.steps,
        })
      }
      setShowEditor(false)
      setEditingWorkflow(null)
      await loadWorkflows()
    } catch (error) {
      alert(`Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete (workflowId: string) {
    if (!confirm('Are you sure you want to delete this workflow?')) return

    try {
      await deleteWorkflow(workflowId)
      await loadWorkflows()
    } catch (error) {
      alert(
        `Failed to delete workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async function handleRun (workflowId: string) {
    try {
      await triggerRun(workflowId)
      alert('Workflow triggered successfully')
    } catch (error) {
      alert(
        `Failed to trigger workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async function handleYamlImport () {
    if (!yamlInput.trim()) return

    setSaving(true)
    try {
      await importWorkflowYaml(yamlInput)
      setShowYamlImport(false)
      setYamlInput('')
      await loadWorkflows()
    } catch (error) {
      alert(
        `Failed to import workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold text-white'>Workflows</h1>
        <div className='flex gap-2'>
          <button
            onClick={() => setShowYamlImport(true)}
            className='px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg'
          >
            Import YAML
          </button>
          <button
            onClick={startCreate}
            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg'
          >
            Create Workflow
          </button>
        </div>
      </div>

      {/* Workflow Editor Modal */}
      {showEditor && editingWorkflow && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto'>
          <div className='bg-slate-800 rounded-lg p-6 w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto'>
            <div className='flex items-center justify-between mb-6'>
              <h2 className='text-lg font-semibold text-white'>
                {editingWorkflow.id ? 'Edit Workflow' : 'Create Workflow'}
              </h2>
              <button onClick={cancelEdit} className='text-slate-400 hover:text-white'>
                ✕
              </button>
            </div>

            <div className='space-y-4'>
              <div>
                <label className='block text-sm text-slate-400 mb-1'>Name *</label>
                <input
                  type='text'
                  value={editingWorkflow.name}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
                  className='w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                  placeholder='Workflow name'
                />
              </div>

              <div>
                <label htmlFor='description' className='block text-sm text-slate-400 mb-1'>Description</label>
                <textarea
                  id='description'
                  name='description'
                  value={editingWorkflow.description}
                  onChange={(e) =>
                    setEditingWorkflow({ ...editingWorkflow, description: e.target.value })}
                  className='w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                  rows={2}
                  placeholder='Brief description of this workflow'
                />
              </div>

              <StepEditor
                steps={editingWorkflow.steps}
                onChange={(steps) => setEditingWorkflow({ ...editingWorkflow, steps })}
              />
            </div>

            <div className='flex justify-end gap-2 mt-6 pt-4 border-t border-slate-700'>
              <button
                type='button'
                onClick={cancelEdit}
                className='px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleSave}
                disabled={saving || !editingWorkflow.name.trim()}
                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg'
              >
                {saving ? 'Saving...' : editingWorkflow.id ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YAML Import Modal */}
      {showYamlImport && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
          <div className='bg-slate-800 rounded-lg p-6 w-full max-w-2xl'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-semibold text-white'>Import Workflow from YAML</h2>
              <button
                onClick={() => setShowYamlImport(false)}
                className='text-slate-400 hover:text-white'
              >
                ✕
              </button>
            </div>

            <div className='mb-4'>
              <textarea
                value={yamlInput}
                onChange={(e) => setYamlInput(e.target.value)}
                className='w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                rows={15}
                placeholder={`name: my-workflow
description: A sample workflow
steps:
  - step_id: step1
    name: First Step
    agent_id: architect
    input_template: |
      Process this task: {{task}}
    expects: result
    type: single`}
              />
            </div>

            <div className='flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setShowYamlImport(false)}
                className='px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleYamlImport}
                disabled={saving || !yamlInput.trim()}
                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg'
              >
                {saving ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflows List */}
      <div className='bg-slate-800 rounded-lg overflow-hidden'>
        {workflows.length === 0
          ? (
            <div className='text-center py-12 text-slate-400'>
              No workflows yet. Create one to get started.
            </div>
            )
          : (
            <table className='w-full'>
              <thead className='bg-slate-700'>
                <tr>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Name</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Description</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Steps</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Created</th>
                  <th className='text-right px-4 py-3 text-slate-300 font-medium'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-700'>
                {workflows.map((workflow) => (
                  <tr key={workflow.id} className='hover:bg-slate-700/50'>
                    <td className='px-4 py-3 text-white font-medium'>{workflow.name}</td>
                    <td className='px-4 py-3 text-slate-400 max-w-xs truncate'>
                      {workflow.description || '-'}
                    </td>
                    <td className='px-4 py-3 text-slate-400'>{workflow.steps?.length || 0}</td>
                    <td className='px-4 py-3 text-slate-400'>
                      {workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className='px-4 py-3 text-right'>
                      <button
                        onClick={() => handleRun(workflow.id)}
                        className='text-green-400 hover:text-green-300 text-sm mr-3'
                      >
                        Run
                      </button>
                      <button
                        onClick={() => startEdit(workflow)}
                        className='text-blue-400 hover:text-blue-300 text-sm mr-3'
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(workflow.id)}
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
