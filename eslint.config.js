import neostandard from 'neostandard'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.prisma/**',
      '**/e2e-results/**',
      '**/test-results/**',
      'nodejs/frontend/**', // Legacy frontend
    ],
  },
  ...neostandard({
    ts: true,
  }),
  {
    rules: {
      // Disable camelCase for API routes - Prisma uses snake_case (PostgreSQL standard)
      camelcase: 'off',
    }
  }
]
