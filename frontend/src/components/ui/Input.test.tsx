import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'

describe('Input', () => {
  it('renders input element', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByTestId('input')).toBeInTheDocument()
    expect(screen.getByTestId('input')).toHaveAttribute('placeholder', 'Enter text')
  })

  it('applies default styling', () => {
    render(<Input />)
    const input = screen.getByTestId('input')
    expect(input).toHaveClass('bg-slate-800', 'border-slate-700')
  })

  it('shows error state', () => {
    render(<Input error />)
    const input = screen.getByTestId('input')
    expect(input).toHaveClass('border-red-500')
  })

  it('disables when disabled prop is true', () => {
    render(<Input disabled />)
    expect(screen.getByTestId('input')).toBeDisabled()
  })

  it('calls onChange when value changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input onChange={onChange} />)

    await user.type(screen.getByTestId('input'), 'hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('applies custom className', () => {
    render(<Input className="custom-class" />)
    expect(screen.getByTestId('input')).toHaveClass('custom-class')
  })

  it('supports different input types', () => {
    const { rerender } = render(<Input type="text" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'text')

    rerender(<Input type="password" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password')

    rerender(<Input type="email" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'email')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})
