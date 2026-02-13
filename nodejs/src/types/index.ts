import type { User } from '@prisma/client'

// Re-export User type for convenience
export type { User }

// Note: Fastify module augmentation is done in src/middleware/auth.ts
// to avoid duplicate declarations
