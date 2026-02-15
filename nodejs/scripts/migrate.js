import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const prisma = new PrismaClient()

async function runMigrations () {
  console.log('Checking for pending migrations...')

  const migrationsDir = path.join(__dirname, '../prisma/migrations')

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true })
    console.log('Created migrations directory')
  }

  try {
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('Migrations completed successfully')
    return true
  } catch (error) {
    console.error('Migration failed:', error.message)
    return false
  }
}

async function generateClient () {
  console.log('Generating Prisma client...')
  try {
    execSync('npx prisma generate', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('Prisma client generated successfully')
    return true
  } catch (error) {
    console.error('Failed to generate Prisma client:', error.message)
    return false
  }
}

async function checkConnection () {
  try {
    await prisma.$connect()
    console.log('Database connection successful')
    return true
  } catch (error) {
    console.error('Database connection failed:', error.message)
    return false
  }
}

async function main () {
  const args = process.argv.slice(2)
  const command = args[0] || 'migrate'

  switch (command) {
    case 'migrate':
      await generateClient()
      if (await checkConnection()) {
        await runMigrations()
      }
      break
    case 'generate':
      await generateClient()
      break
    case 'status':
      await generateClient()
      if (await checkConnection()) {
        console.log('Database is ready')
      }
      break
    default:
      console.log('Usage: node scripts/migrate.js [migrate|generate|status]')
      process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Migration script error:', error)
  process.exit(1)
})
