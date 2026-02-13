import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import path from 'path'

expect.extend(matchers)

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
