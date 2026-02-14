import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl })

  try {
    await client.connect()
    console.log('Connected to database')

    const migrationsDir = path.join(__dirname, 'migrations')

    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found')
      return
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    console.log(`Found ${migrationFiles.length} migration files`)

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `)

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file)

      const existing = await client.query(
        'SELECT id FROM _schema_migrations WHERE filename = $1',
        [file]
      )

      if (existing.rows.length > 0) {
        console.log(`Skipping ${file} (already applied)`)
        continue
      }

      console.log(`Applying migration: ${file}`)

      const sql = fs.readFileSync(filePath, 'utf8')

      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`✅ Applied ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        const err = error as Error
        console.error(`Failed to apply ${file}:`, err.message)
        throw error
      }
    }

    console.log('Migrations completed successfully')
  } finally {
    await client.end()
  }
}
