import type { GithubLearningSyncConfig, LearningDataExport } from "@/types/learning"
import { db } from "@/utils/db/dexie/db"
import { exportLearningData, mergeLearningData } from "./export"

const CONFIG_ID = "github-learning-sync"

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function encodeRepoPath(path: string) {
  return path.split("/").map(segment => encodeURIComponent(segment)).join("/")
}

async function githubRequest<T>(
  config: Pick<GithubLearningSyncConfig, "token">,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!config.token) {
    throw new Error("GitHub token is required for sync")
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub request failed (${response.status}): ${text}`)
  }

  return await response.json() as T
}

async function githubRequestWithToken<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return await githubRequest<T>({ token }, path, init)
}

export async function getGithubLearningSyncConfig() {
  return await db.githubLearningSyncConfig.get(CONFIG_ID)
}

export async function saveGithubLearningSyncConfig(input: Omit<GithubLearningSyncConfig, "id" | "updatedAt">) {
  const config: GithubLearningSyncConfig = {
    id: CONFIG_ID,
    ...input,
    updatedAt: new Date(),
  }
  await db.githubLearningSyncConfig.put(config)
  return config
}

export async function syncLearningDataToGithub() {
  const config = await getGithubLearningSyncConfig()
  if (!config) {
    throw new Error("GitHub sync is not configured")
  }

  type ContentResponse = {
    content: string
    sha: string
  }

  let remoteSha: string | undefined
  try {
    const remote = await githubRequest<ContentResponse>(
      config,
      `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(config.path)}?ref=${encodeURIComponent(config.branch)}`,
    )
    remoteSha = remote.sha
    const remoteData = JSON.parse(decodeBase64Utf8(remote.content.replace(/\n/g, ""))) as LearningDataExport
    await mergeLearningData(remoteData)
  }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes("(404)")) {
      throw error
    }
  }

  const mergedExport = await exportLearningData()
  const body = {
    message: `Sync Read Frog learning data ${new Date().toISOString()}`,
    content: encodeBase64Utf8(JSON.stringify(mergedExport, null, 2)),
    branch: config.branch,
    sha: remoteSha,
  }

  await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(config.path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )

  const nextConfig: GithubLearningSyncConfig = {
    ...config,
    lastSyncAt: new Date(),
    updatedAt: new Date(),
  }
  await db.githubLearningSyncConfig.put(nextConfig)
  return nextConfig
}

export async function createPrivateLearningDataRepo(input: {
  token: string
  repo: string
  description?: string
}) {
  return await githubRequestWithToken(
    input.token,
    "/user/repos",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.repo,
        description: input.description ?? "Private Read Frog learning data backup",
        private: true,
        auto_init: true,
      }),
    },
  )
}

export async function requestGithubDeviceCode(clientId: string) {
  const body = new URLSearchParams({
    client_id: clientId,
    scope: "repo",
  })
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`GitHub device code request failed (${response.status})`)
  }

  return await response.json() as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }
}

export async function pollGithubDeviceToken(input: {
  clientId: string
  deviceCode: string
}) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    device_code: input.deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  })
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`GitHub token request failed (${response.status})`)
  }

  return await response.json() as {
    access_token?: string
    token_type?: string
    scope?: string
    error?: string
    error_description?: string
  }
}
