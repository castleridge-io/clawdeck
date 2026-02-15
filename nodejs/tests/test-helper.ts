// Test helper - loads environment variables
// This must be imported before any other test code

import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// Determine which env file to load
const envPath = process.env.DOTENV_CONFIG_PATH
  ? process.env.DOTENV_CONFIG_PATH
  : fileURLToPath(new URL('../.env.test', import.meta.url))

console.log(`[test-helper] Loading env from: ${envPath}`)
dotenv.config({ path: envPath })
