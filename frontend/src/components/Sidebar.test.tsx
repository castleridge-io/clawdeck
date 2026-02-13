import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { SidebarProvider } from './DashboardLayout'

// Mock useAuth
const mockLogout = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      emailAddress: 'test@example.com',
      admin: false,
      agentName: 'Test User',
      agentEmoji: '👤',
    },
    logout: mockLogout,
  }),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderSidebar() {
  return render(
    <BrowserRouter>
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    </BrowserRouter>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders ClawDeck logo', () => {
    renderSidebar()

    expect(screen.getByText('ClawDeck')).toBeInTheDocument()
  })

  it('renders workspace navigation items', () => {
    renderSidebar()

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Boards')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Archive')).toBeInTheDocument()
  })

  it('renders automation navigation items', () => {
    renderSidebar()

    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('Runs')).toBeInTheDocument()
  })

  it('renders system navigation items', () => {
    renderSidebar()

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('does not show admin link for non-admin users', () => {
    renderSidebar()

    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('shows user info', () => {
    renderSidebar()

    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('calls logout and navigates to login on sign out', async () => {
    const user = userEvent.setup()
    mockLogout.mockResolvedValueOnce(undefined)

    renderSidebar()

    await user.click(screen.getByText('Sign out'))

    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
