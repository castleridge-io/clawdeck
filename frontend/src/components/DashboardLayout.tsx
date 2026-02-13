import { createContext, useContext, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar () {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within DashboardLayout')
  }
  return context
}

export function SidebarProvider ({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

export default function DashboardLayout () {
  const [collapsed, setCollapsed] = useState(false)

  const marginLeft = collapsed ? 'ml-16' : 'ml-60'

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className='min-h-screen bg-slate-900 flex'>
        <Sidebar />
        <main className={`flex-1 ${marginLeft} transition-all duration-200`}>
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  )
}
