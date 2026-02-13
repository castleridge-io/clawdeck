import Fastify from 'fastify'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import app from './app.js'

dotenv.config()

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
})

// Register the app
fastify.register(app)

// Prisma client for migrations
const prisma = new PrismaClient()

// Auto-migrate on startup (if enabled)
const autoMigrate = process.env.AUTO_MIGRATE === 'true'

// Auto-seed on startup (if enabled)
const autoSeed = process.env.AUTO_SEED === 'true'

// Start server
const start = async (): Promise<void> => {
  try {
    // Run migrations if auto-migrate is enabled
    if (autoMigrate) {
      console.log('Running database migrations...')
      try {
        await prisma.$connect()

        // Generate Prisma client first
        const { execSync } = require('child_process')
        execSync('npx prisma generate', { stdio: 'inherit' })

        // Deploy migrations
        execSync('npx prisma migrate deploy', { stdio: 'inherit' })
        console.log('✅ Migrations completed')
      } catch (error) {
        const err = error as Error
        console.error('❌ Migration failed:', err.message)
        console.log('Continuing startup anyway...')
      } finally {
        await prisma.$disconnect()
      }
    }

    const host = process.env.HOST || '0.0.0.0'
    const port = parseInt(process.env.PORT || '3000')

    await fastify.listen({ port, host })
    console.log(`Server listening on ${host}:${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
