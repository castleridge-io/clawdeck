import Fastify from 'fastify'
import dotenv from 'dotenv'
import app from './app.js'
import { runMigrations } from './db/migrations.js'

dotenv.config()

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
})

// Register the app
fastify.register(app)

// Auto-migrate on startup (if enabled)
const autoMigrate = process.env.AUTO_MIGRATE === 'true'

// Start server
const start = async (): Promise<void> => {
  try {
    // Run migrations if auto-migrate is enabled
    if (autoMigrate) {
      console.log('Running database migrations...')
      try {
        const databaseUrl = process.env.DATABASE_URL
        if (!databaseUrl) {
          throw new Error('DATABASE_URL environment variable is required')
        }
        await runMigrations(databaseUrl)
        console.log('✅ Migrations completed')
      } catch (error) {
        const err = error as Error
        console.error('❌ Migration failed:', err.message)
        console.log('Continuing startup anyway...')
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
