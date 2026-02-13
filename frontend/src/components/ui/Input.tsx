import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error = false, className = '', type = 'text', ...props }, ref) => {
    const baseStyles =
      'w-full px-3 py-2 rounded-lg border text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors'

    const normalStyles = 'bg-slate-800 border-slate-700'
    const errorStyles = 'border-red-500'

    return (
      <input
        ref={ref}
        data-testid='input'
        type={type}
        className={`${baseStyles} ${error ? errorStyles : normalStyles} ${className}`}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
