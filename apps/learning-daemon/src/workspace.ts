import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const moduleDir = dirname(fileURLToPath(import.meta.url))
const workspaceIndexPath = join(moduleDir, "..", "workspace", "index.html")

let workspaceHtmlCache: string | undefined

export async function readLearningWorkspaceHtml() {
  workspaceHtmlCache ??= await readFile(workspaceIndexPath, "utf8")
  return workspaceHtmlCache
}
