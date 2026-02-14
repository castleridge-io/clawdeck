import dotenv from 'dotenv'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load test environment variables
dotenv.config({ path: join(__dirname, '../.env.test') })
