import dotenv from 'dotenv'
import { parentPort } from 'node:worker_threads'

// Load test environment variables
dotenv.config({ path: new URL('../.env.test', import.meta.url) })

// If running as a worker (node --test uses workers), signal ready
if (parentPort) {
  parentPort.postMessage('ready')
}
