import { useState, useEffect } from 'react'
import { getAgents } from '../lib/api'
import type { Agent } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

export default function AgentsPage () {
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    loadAgents()
  }, [])

  async function loadAgents () {
    try {
      const data = await getAgents()
      setAgents(data)
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusColor (status?: string) {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'idle':
        return 'bg-amber-500'
      default:
        return 'bg-slate-500'
    }
  }

  function formatLastActive (dateString?: string) {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold text-white mb-6'>Agents</h1>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {agents.map((agent) => (
          <div
            key={agent.id}
            className='bg-slate-800 rounded-lg p-4 hover:bg-slate-700 transition-colors'
          >
            <div className='flex items-start justify-between'>
              <div className='flex items-center gap-3'>
                <div
                  className='w-12 h-12 rounded-lg flex items-center justify-center text-2xl'
                  style={{ backgroundColor: agent.color || '#334155' }}
                >
                  {agent.emoji || '🤖'}
                </div>
                <div>
                  <h3 className='text-white font-medium'>{agent.name}</h3>
                  <p className='text-slate-400 text-sm'>{agent.slug}</p>
                </div>
              </div>
              <div className='flex items-center gap-1'>
                <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                <span className='text-xs text-slate-400 capitalize'>
                  {agent.status || 'offline'}
                </span>
              </div>
            </div>

            <div className='mt-4 pt-4 border-t border-slate-700'>
              <p className='text-xs text-slate-500'>
                Last active: {formatLastActive(agent.lastActiveAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className='bg-slate-800 rounded-lg p-12 text-center'>
          <div className='text-6xl mb-4'>🤖</div>
          <h2 className='text-xl font-semibold text-white mb-2'>No Agents</h2>
          <p className='text-slate-400'>Agents will appear here when they are configured.</p>
        </div>
      )}
    </div>
  )
}
