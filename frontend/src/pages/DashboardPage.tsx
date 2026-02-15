import { Link } from 'react-router-dom'
import { useDashboard } from '../hooks/useDashboard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function DashboardPage () {
  const { data, isLoading, error } = useDashboard()

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (error || !data) {
    return (
      <div className='p-6'>
        <p className='text-red-400'>Failed to load dashboard data</p>
      </div>
    )
  }

  const { boards, agents, taskCounts } = data
  const activeAgents = agents.filter((a) => a.status === 'active').length

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold text-white mb-6'>Dashboard</h1>

      {/* Stats Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
        <div className='bg-slate-800 rounded-lg p-4'>
          <p className='text-slate-400 text-sm'>Total Tasks</p>
          <p className='text-3xl font-bold text-white'>{taskCounts.total}</p>
        </div>

        <div className='bg-slate-800 rounded-lg p-4'>
          <p className='text-slate-400 text-sm'>In Progress</p>
          <p className='text-3xl font-bold text-amber-400'>{taskCounts.in_progress}</p>
        </div>

        <div className='bg-slate-800 rounded-lg p-4'>
          <p className='text-slate-400 text-sm'>Active Agents</p>
          <p className='text-3xl font-bold text-green-400'>{activeAgents}</p>
        </div>

        <div className='bg-slate-800 rounded-lg p-4'>
          <p className='text-slate-400 text-sm'>Completed</p>
          <p className='text-3xl font-bold text-blue-400'>{taskCounts.done}</p>
        </div>
      </div>

      {/* Task Status Overview */}
      <div className='bg-slate-800 rounded-lg p-6 mb-8'>
        <h2 className='text-lg font-semibold text-white mb-4'>Task Overview</h2>
        <div className='flex gap-4'>
          {Object.entries(taskCounts)
            .filter(([status]) => status !== 'total')
            .map(([status, count]) => (
              <div key={status} className='flex-1 text-center'>
                <div className='text-2xl font-bold text-white mb-1'>{count}</div>
                <div className='text-xs text-slate-400 uppercase'>{status.replace('_', ' ')}</div>
              </div>
            ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Link
          to='/boards'
          className='bg-slate-800 rounded-lg p-4 hover:bg-slate-700 transition-colors'
        >
          <h3 className='text-white font-medium mb-1'>📋 Boards</h3>
          <p className='text-slate-400 text-sm'>{boards.length} boards</p>
        </Link>

        <Link
          to='/agents'
          className='bg-slate-800 rounded-lg p-4 hover:bg-slate-700 transition-colors'
        >
          <h3 className='text-white font-medium mb-1'>🤖 Agents</h3>
          <p className='text-slate-400 text-sm'>{agents.length} agents</p>
        </Link>

        <Link
          to='/runs'
          className='bg-slate-800 rounded-lg p-4 hover:bg-slate-700 transition-colors'
        >
          <h3 className='text-white font-medium mb-1'>▶️ Runs</h3>
          <p className='text-slate-400 text-sm'>View execution history</p>
        </Link>
      </div>
    </div>
  )
}
