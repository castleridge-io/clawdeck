import { useState, useEffect } from 'react'
import { getRuns, getWorkflows, triggerRun, cancelRun } from '../lib/api'
import type { Run, Workflow, RunStatus } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

const STATUS_OPTIONS: { value: RunStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function RunsPage () {
  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<Run[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [statusFilter, setStatusFilter] = useState<RunStatus | ''>('')

  useEffect(() => {
    loadData()
  }, [statusFilter])

  async function loadData () {
    try {
      const [runsData, workflowsData] = await Promise.all([
        getRuns({ status: statusFilter || undefined }),
        getWorkflows(),
      ])
      setRuns(Array.isArray(runsData) ? runsData : [])
      setWorkflows(Array.isArray(workflowsData) ? workflowsData : [])
    } catch (error) {
      console.error('Failed to load runs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleTrigger (workflowId: string) {
    try {
      await triggerRun(workflowId)
      await loadData()
    } catch (error) {
      alert(`Failed to trigger run: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleCancel (runId: string) {
    try {
      await cancelRun(runId)
      await loadData()
    } catch (error) {
      alert(`Failed to cancel run: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  function getWorkflowName (workflowId: string) {
    const workflow = workflows.find((w) => w.id === workflowId)
    return workflow?.name || 'Unknown'
  }

  function formatDate (dateString?: string) {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold text-white'>Runs</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RunStatus | '')}
          className='px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Quick Trigger */}
      {workflows.length > 0 && (
        <div className='bg-slate-800 rounded-lg p-4 mb-6'>
          <h2 className='text-sm font-medium text-slate-400 mb-3'>Quick Trigger</h2>
          <div className='flex flex-wrap gap-2'>
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                onClick={() => handleTrigger(workflow.id)}
                className='px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg'
              >
                Run: {workflow.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Runs List */}
      <div className='bg-slate-800 rounded-lg overflow-hidden'>
        {runs.length === 0
          ? (
            <div className='text-center py-12 text-slate-400'>No runs found</div>
            )
          : (
            <table className='w-full'>
              <thead className='bg-slate-700'>
                <tr>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Workflow</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Status</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Started</th>
                  <th className='text-left px-4 py-3 text-slate-300 font-medium'>Completed</th>
                  <th className='text-right px-4 py-3 text-slate-300 font-medium'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-700'>
                {runs.map((run) => (
                  <tr key={run.id} className='hover:bg-slate-700/50'>
                    <td className='px-4 py-3 text-white'>
                      {run.workflow?.name || getWorkflowName(run.workflow_id)}
                    </td>
                    <td className='px-4 py-3'>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                        run.status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : run.status === 'running'
                            ? 'bg-blue-500/20 text-blue-400'
                            : run.status === 'failed'
                              ? 'bg-red-500/20 text-red-400'
                              : run.status === 'cancelled'
                                ? 'bg-slate-500/20 text-slate-400'
                                : 'bg-amber-500/20 text-amber-400'
                      }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-slate-300'>{formatDate(run.started_at)}</td>
                    <td className='px-4 py-3 text-slate-300'>{formatDate(run.completed_at)}</td>
                    <td className='px-4 py-3 text-right'>
                      {run.status === 'running' && (
                        <button
                          onClick={() => handleCancel(run.id)}
                          className='text-red-400 hover:text-red-300 text-sm'
                        >
                        Cancel
                        </button>
                      )}
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
