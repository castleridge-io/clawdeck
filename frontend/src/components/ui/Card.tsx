import { type ReactNode, type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      data-testid="card"
      className={`bg-slate-800 rounded-lg border border-slate-700 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', ...props }: CardProps) {
  return (
    <div
      data-testid="card-header"
      className={`p-4 border-b border-slate-700 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', ...props }: CardProps) {
  return (
    <h3
      data-testid="card-title"
      className={`text-lg font-semibold text-white ${className}`}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardContent({ children, className = '', ...props }: CardProps) {
  return (
    <div
      data-testid="card-content"
      className={`p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
