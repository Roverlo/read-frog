import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const daemonDir = join(process.cwd(), "apps", "learning-daemon")

async function readDaemonFile(fileName: string) {
  return await readFile(join(daemonDir, fileName), "utf8")
}

describe("learning daemon container packaging", () => {
  it("keeps the Docker image health-checked against the daemon health endpoint", async () => {
    const dockerfile = await readDaemonFile("Dockerfile")

    expect(dockerfile).toContain("HEALTHCHECK")
    expect(dockerfile).toContain("/api/v1/health")
    expect(dockerfile).toContain("READFROG_LEARNING_PORT")
    expect(dockerfile).toContain("READFROG_LEARNING_DATA_DIR=/data")
  })

  it("keeps compose bound to localhost with persistent daemon-owned data", async () => {
    const compose = await readDaemonFile("compose.yaml")

    expect(compose).toContain("127.0.0.1:7457:7457")
    expect(compose).toContain("readfrog-learning-data:/data")
    expect(compose).toContain("healthcheck:")
    expect(compose).toContain("/api/v1/health")
  })
})
