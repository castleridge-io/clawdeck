import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSidebar } from './DashboardLayout'

interface NavItem {
  to: string
  label: string
  icon: string
}

const WORKSPACE_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/boards', label: 'Boards', icon: '📋' },
  { to: '/tasks', label: 'Tasks', icon: '✅' },
  { to: '/archive', label: 'Archive', icon: '📦' },
]

const AUTOMATION_ITEMS: NavItem[] = [
  { to: '/agents', label: 'Agents', icon: '🤖' },
  { to: '/workflows', label: 'Workflows', icon: '🔄' },
  { to: '/runs', label: 'Runs', icon: '▶️' },
]

const SYSTEM_ITEMS: NavItem[] = [{ to: '/settings', label: 'Settings', icon: '⚙️' }]

export default function Sidebar () {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { collapsed, setCollapsed } = useSidebar()

  async function handleLogout () {
    await logout()
    navigate('/login')
  }

  const width = collapsed ? 'w-16' : 'w-60'

  return (
    <aside
      className={`${width} bg-slate-800 fixed left-0 top-0 bottom-0 flex flex-col transition-all duration-200`}
    >
      {/* Logo */}
      <div className='p-4 border-b border-slate-700 flex items-center justify-between'>
        <h1 className='text-xl font-bold text-white flex items-center gap-2 overflow-hidden'>
          <span className='text-2xl flex-shrink-0'>🦀</span>
          {!collapsed && <span className='whitespace-nowrap'>ClawDeck</span>}
        </h1>
        <button
          onClick={() => setCollapsed(!collapsed)}
          data-testid='sidebar-toggle'
          className='text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition-colors'
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-5 h-5 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M11 19l-7-7 7-7m8 14l-7-7 7-7'
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className='flex-1 overflow-y-auto py-4'>
        {/* Workspace Section */}
        {!collapsed && (
          <h2 className='px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2'>
            Workspace
          </h2>
        )}
        {WORKSPACE_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <span className='flex-shrink-0'>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}

        {/* Automation Section */}
        <div className='mt-4'>
          {!collapsed && (
            <h2 className='px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2'>
              Automation
            </h2>
          )}
          {AUTOMATION_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className='flex-shrink-0'>{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          ))}
        </div>

        {/* System Section */}
        <div className='mt-4'>
          {!collapsed && (
            <h2 className='px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2'>
              System
            </h2>
          )}
          {SYSTEM_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className='flex-shrink-0'>{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          ))}

          {/* Admin link - only for admins */}
          {user?.admin && (
            <NavLink
              to='/admin'
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? 'Admin' : undefined}
            >
              <span className='flex-shrink-0'>🔐</span>
              {!collapsed && 'Admin'}
            </NavLink>
          )}

          {/* Admin Data link - only for admins */}
          {user?.admin && (
            <NavLink
              to='/admin/data'
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? 'Admin Data' : undefined}
            >
              <span className='flex-shrink-0'>📊</span>
              {!collapsed && 'Admin Data'}
            </NavLink>
          )}
        </div>
      </nav>

      {/* User Section */}
      <div className='p-4 border-t border-slate-700'>
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className='w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-sm flex-shrink-0'>
            {user?.agentEmoji || '👤'}
          </div>
          {!collapsed && (
            <div className='flex-1 min-w-0'>
              <p className='text-sm text-white truncate'>{user?.agentName || user?.emailAddress}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={handleLogout}
            data-testid='logout-button'
            className='w-full px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors text-left'
          >
            Sign out
          </button>
        )}
        {collapsed && (
          <button
            onClick={handleLogout}
            data-testid='logout-button'
            className='w-full flex justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors py-2'
            title='Sign out'
          >
            🚪
          </button>
        )}
      </div>
    </aside>
  )
}
