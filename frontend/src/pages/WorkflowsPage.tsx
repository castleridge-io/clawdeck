import { useState, useEffect } from 'react'
import { getWorkflows, createWorkflow, deleteWorkflow, triggerRun } from '../lib/api'
import type { Workflow } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

export default function WorkflowsPage() {
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    loadWorkflows()
  }, [])

  async function loadWorkflows() {
    try {
      const data = await getWorkflows()
      setWorkflows(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load workflows:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    try {
      await createWorkflow({ name: newName.trim() })
      setNewName('')
      setShowCreate(false)
      await loadWorkflows()
    } catch (error) {
      alert(`Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleDelete(workflowId: string) {
    if (!confirm('Are you sure you want to delete this workflow?')) return

    try {
      await deleteWorkflow(workflowId)
      await loadWorkflows()
    } catch (error) {
      alert(`Failed to delete workflow: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleRun(workflowId: string) {
    try {
      await triggerRun(workflowId)
      alert('Workflow triggered successfully')
    } catch (error) {
      alert(`Failed to trigger workflow: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Workflows</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          Create Workflow
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Create Workflow</h2>
            <form onSubmit={handleCreate}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Workflow name"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Workflows List */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        {workflows.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No workflows yet. Create one to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Steps</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Created</th>
                <th className="text-right px-4 py-3 text-slate-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {workflows.map(workflow => (
                <tr key={workflow.id} className="hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-white">{workflow.name}</td>
                  <td className="px-4 py-3 text-slate-400">{workflow.steps?.length || 0}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRun(workflow.id)}
                      className="text-green-400 hover:text-green-300 text-sm mr-3"
                    >
                      Run
                    </button>
                    <button
                      onClick={() => handleDelete(workflow.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
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
