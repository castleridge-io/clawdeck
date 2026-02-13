import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getAdminBoards, getAdminTasks } from '../lib/api'
import type { AdminBoard, AdminTask } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

type Tab = 'boards' | 'tasks'

export default function AdminDataPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('boards')
  const [loading, setLoading] = useState(true)
  const [boards, setBoards] = useState<AdminBoard[]>([])
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    if (user?.admin) {
      loadData()
    }
  }, [user, activeTab, page])

  async function loadData() {
    setLoading(true)
    try {
      if (activeTab === 'boards') {
        const result = await getAdminBoards({ page, limit: 20 })
        setBoards(result.data)
        setTotalPages(result.meta.pages)
      } else {
        const result = await getAdminTasks({ page, limit: 20 })
        setTasks(result.data)
        setTotalPages(result.meta.pages)
      }
    } catch (error) {
      console.error(`Failed to load ${activeTab}:`, error)
    } finally {
      setLoading(false)
    }
  }

  if (!user?.admin) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Data</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab('boards'); setPage(1) }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'boards'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Boards
        </button>
        <button
          onClick={() => { setActiveTab('tasks'); setPage(1) }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'tasks'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Tasks
        </button>
      </div>

      {/* Content */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : activeTab === 'boards' ? (
          <BoardsTable boards={boards} />
        ) : (
          <TasksTable tasks={tasks} />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-700 flex justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-slate-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded bg-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function BoardsTable({ boards }: { boards: AdminBoard[] }) {
  if (boards.length === 0) {
    return <div className="p-8 text-center text-slate-400">No boards found</div>
  }

  return (
    <table className="w-full">
      <thead className="bg-slate-700">
        <tr>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Board</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Owner</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Tasks</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Created</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700">
        {boards.map(board => (
          <tr key={board.id} className="hover:bg-slate-700/50">
            <td className="px-4 py-3">
              <span className="mr-2">{board.icon}</span>
              <span className="text-white">{board.name}</span>
            </td>
            <td className="px-4 py-3">
              <div className="text-white">{board.owner.emailAddress}</div>
              {board.owner.agentName && (
                <div className="text-slate-400 text-sm">{board.owner.agentName}</div>
              )}
            </td>
            <td className="px-4 py-3 text-slate-300">{board.task_count}</td>
            <td className="px-4 py-3 text-slate-400 text-sm">
              {new Date(board.created_at).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TasksTable({ tasks }: { tasks: AdminTask[] }) {
  if (tasks.length === 0) {
    return <div className="p-8 text-center text-slate-400">No tasks found</div>
  }

  return (
    <table className="w-full">
      <thead className="bg-slate-700">
        <tr>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Task</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Status</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Owner</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Board</th>
          <th className="text-left px-4 py-3 text-slate-300 font-medium">Created</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700">
        {tasks.map(task => (
          <tr key={task.id} className="hover:bg-slate-700/50">
            <td className="px-4 py-3 text-white">{task.name}</td>
            <td className="px-4 py-3">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                {task.status}
              </span>
            </td>
            <td className="px-4 py-3">
              {task.owner ? (
                <>
                  <div className="text-white">{task.owner.emailAddress}</div>
                  {task.owner.agentName && (
                    <div className="text-slate-400 text-sm">{task.owner.agentName}</div>
                  )}
                </>
              ) : (
                <span className="text-slate-500">-</span>
              )}
            </td>
            <td className="px-4 py-3 text-slate-300">
              {task.board?.name || '-'}
            </td>
            <td className="px-4 py-3 text-slate-400 text-sm">
              {new Date(task.created_at).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    inbox: 'bg-slate-500/20 text-slate-400',
    up_next: 'bg-blue-500/20 text-blue-400',
    in_progress: 'bg-amber-500/20 text-amber-400',
    in_review: 'bg-purple-500/20 text-purple-400',
    done: 'bg-green-500/20 text-green-400',
  }
  return colors[status] || 'bg-slate-500/20 text-slate-400'
}
