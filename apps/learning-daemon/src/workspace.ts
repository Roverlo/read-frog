import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const moduleDir = dirname(fileURLToPath(import.meta.url))
const workspaceDir = join(moduleDir, "..", "workspace")
const workspaceAssetPaths = {
  "/workspace/app.css": join(workspaceDir, "app.css"),
  "/workspace/app.js": join(workspaceDir, "app.js"),
  "/workspace/index.html": join(workspaceDir, "index.html"),
}

const workspaceAssetCache = new Map<string, string>()

export async function readLearningWorkspaceHtml() {
  const html = await readLearningWorkspaceAsset("/workspace/index.html")
  if (html === undefined) {
    throw new Error("Learning workspace index.html is missing")
  }
  return html
}

export function getLearningWorkspaceAssetContentType(path: string) {
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8"
  }
  if (path.endsWith(".js")) {
    return "text/javascript; charset=utf-8"
  }
  if (path.endsWith(".html")) {
    return "text/html; charset=utf-8"
  }
  return undefined
}

export async function readLearningWorkspaceAsset(path: string) {
  const filePath = workspaceAssetPaths[path as keyof typeof workspaceAssetPaths]
  if (!filePath) {
    return undefined
  }

  let content = workspaceAssetCache.get(path)
  if (content === undefined) {
    content = await readFile(filePath, "utf8")
    workspaceAssetCache.set(path, content)
  }
  return content
}
