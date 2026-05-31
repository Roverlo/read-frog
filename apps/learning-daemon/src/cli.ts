import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { createLearningDaemonServer } from "./server.ts"
import { createFileLearningDaemonStore } from "./store.ts"

const host = process.env.READFROG_LEARNING_HOST ?? "127.0.0.1"
const port = Number.parseInt(process.env.READFROG_LEARNING_PORT ?? "7457", 10)
const dataDir = process.env.READFROG_LEARNING_DATA_DIR
  ?? join(process.cwd(), ".readfrog-learning")
const allowedOrigins = process.env.READFROG_LEARNING_ALLOWED_ORIGINS
  ?.split(",")
  .map(origin => origin.trim())
  .filter(Boolean)

await mkdir(dataDir, { recursive: true })

const server = createLearningDaemonServer({
  store: createFileLearningDaemonStore(dataDir),
  allowedOrigins,
})

server.listen(port, host, () => {
  const address = server.address()
  const displayAddress = typeof address === "object" && address
    ? `${address.address}:${address.port}`
    : `${host}:${port}`
  console.log(`Read Frog learning daemon listening on http://${displayAddress}`)
  console.log(`Learning data directory: ${dataDir}`)
})

function stop() {
  server.close(() => {
    process.exit(0)
  })
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
