import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardContent } from './Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByTestId('card')).toHaveTextContent('Card content')
  })

  it('applies default styling', () => {
    render(<Card>Content</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('bg-slate-800', 'rounded-lg', 'border', 'border-slate-700')
  })

  it('applies custom className', () => {
    render(<Card className='custom-class'>Content</Card>)
    expect(screen.getByTestId('card')).toHaveClass('custom-class')
  })
})

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header content</CardHeader>)
    expect(screen.getByTestId('card-header')).toHaveTextContent('Header content')
  })

  it('applies default styling', () => {
    render(<CardHeader>Header</CardHeader>)
    expect(screen.getByTestId('card-header')).toHaveClass('p-4', 'border-b', 'border-slate-700')
  })
})

describe('CardTitle', () => {
  it('renders children', () => {
    render(<CardTitle>Title text</CardTitle>)
    expect(screen.getByTestId('card-title')).toHaveTextContent('Title text')
  })

  it('applies default styling', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByTestId('card-title')).toHaveClass('text-lg', 'font-semibold', 'text-white')
  })
})

describe('CardContent', () => {
  it('renders children', () => {
    render(<CardContent>Body content</CardContent>)
    expect(screen.getByTestId('card-content')).toHaveTextContent('Body content')
  })

  it('applies default styling', () => {
    render(<CardContent>Content</CardContent>)
    expect(screen.getByTestId('card-content')).toHaveClass('p-4')
  })
})

describe('Card composition', () => {
  it('renders full card composition', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Test Title</CardTitle>
        </CardHeader>
        <CardContent>Test Content</CardContent>
      </Card>
    )

    expect(screen.getByTestId('card')).toBeInTheDocument()
    expect(screen.getByTestId('card-header')).toBeInTheDocument()
    expect(screen.getByTestId('card-title')).toHaveTextContent('Test Title')
    expect(screen.getByTestId('card-content')).toHaveTextContent('Test Content')
  })
})
