import dotenv from 'dotenv'
import { parentPort } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

// Load test environment variables
const envPath = process.env.DOTENV_CONFIG_PATH || fileURLToPath(new URL('../.env.test', import.meta.url))
console.log('[setup] Loading env from:', envPath)
dotenv.config({ path: envPath })

// If running as a worker (node --test uses workers), signal ready
if (parentPort) {
  parentPort.postMessage('ready')
}
