import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getUsers, updateUser } from '../lib/api'
import type { User } from '../types'
import LoadingSpinner from '../components/LoadingSpinner'

export default function AdminPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    if (user?.admin) {
      loadUsers()
    }
  }, [user])

  async function loadUsers() {
    try {
      const data = await getUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAdmin(userId: string, currentAdmin: boolean) {
    try {
      await updateUser(userId, { admin: !currentAdmin })
      await loadUsers()
    } catch (error) {
      alert(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (!user?.admin) {
    return <Navigate to="/dashboard" replace />
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Admin</h1>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Users</h2>
        </div>

        {users.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No users found
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Agent Name</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Admin</th>
                <th className="text-left px-4 py-3 text-slate-300 font-medium">Created</th>
                <th className="text-right px-4 py-3 text-slate-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-white">{u.emailAddress}</td>
                  <td className="px-4 py-3 text-slate-300">{u.agentName || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      u.admin ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {u.admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== user.id && (
                      <button
                        onClick={() => handleToggleAdmin(u.id, u.admin)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        {u.admin ? 'Remove Admin' : 'Make Admin'}
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
