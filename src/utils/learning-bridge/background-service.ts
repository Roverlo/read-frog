import type {
  LearningBridgeCaptureResult,
  LearningBridgeConfig,
  LearningBridgeFlushResult,
  LearningBridgeProjectionSyncResult,
  LearningBridgeProjectionTermsResult,
  LearningBridgeStatus,
  LearningCaptureQueueStore,
} from "./types"
import type {
  LearningCaptureSelectionInput,
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
  MasteryProjectionResponse,
} from "@/utils/learning-contracts"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import {
  createLearningCaptureSelectionRequest,
  LEARNING_CONTRACT_VERSION,
} from "@/utils/learning-contracts"
import {
  getLearningDaemonHealth,
  getLearningMasteryProjection,
  getLearningMasteryProjectionTerms,
  postLearningCaptureSelection,
} from "./daemon-client"
import {
  enqueuePendingLearningCapture,
  getLearningBridgeConfig,
  getLearningProjectionCache,
  getPendingLearningCaptures,
  replaceLearningProjectionCache,
  replacePendingLearningCaptures,
} from "./storage"

export interface LearningDaemonBridgeClient {
  getHealth: (config: LearningBridgeConfig) => Promise<LearningDaemonHealthResponse>
  captureSelection: (capture: LearningCaptureSelectionRequest, config: LearningBridgeConfig) => Promise<unknown>
  getProjection: (config: LearningBridgeConfig) => Promise<MasteryProjectionResponse>
  getProjectionTerms: (terms: string[], config: LearningBridgeConfig) => Promise<MasteryProjectionResponse>
}

export interface LearningBridgeServiceDeps {
  store?: LearningCaptureQueueStore
  client?: LearningDaemonBridgeClient
  now?: () => string
  createId?: () => string
}

function getDefaultStore(): LearningCaptureQueueStore {
  return {
    getConfig: getLearningBridgeConfig,
    getPendingCaptures: getPendingLearningCaptures,
    replacePendingCaptures: replacePendingLearningCaptures,
    enqueueCapture: enqueuePendingLearningCapture,
    getProjectionCache: getLearningProjectionCache,
    replaceProjectionCache: replaceLearningProjectionCache,
  }
}

function getDefaultClient(): LearningDaemonBridgeClient {
  return {
    getHealth: config => getLearningDaemonHealth({
      baseUrl: config.baseUrl,
      token: config.token,
    }),
    captureSelection: (capture, config) => postLearningCaptureSelection(capture, {
      baseUrl: config.baseUrl,
      token: config.token,
    }),
    getProjection: config => getLearningMasteryProjection({
      baseUrl: config.baseUrl,
      token: config.token,
    }),
    getProjectionTerms: (terms, config) => getLearningMasteryProjectionTerms(terms, {
      baseUrl: config.baseUrl,
      token: config.token,
    }),
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getDeps(deps: LearningBridgeServiceDeps) {
  return {
    store: deps.store ?? getDefaultStore(),
    client: deps.client ?? getDefaultClient(),
    now: deps.now ?? (() => new Date().toISOString()),
    createId: deps.createId ?? getRandomUUID,
  }
}

function getHealthState(health: LearningDaemonHealthResponse): LearningBridgeStatus["state"] {
  return health.contractVersion === LEARNING_CONTRACT_VERSION ? "connected" : "incompatible"
}

function getCachedProjectionEntriesForTerms(
  terms: string[],
  cacheEntries: MasteryProjectionResponse["entries"],
) {
  const normalizedTerms = new Set(terms.map(term => term.trim().toLowerCase()).filter(Boolean))
  return cacheEntries.filter(entry => normalizedTerms.has(entry.normalizedText))
}

async function upsertProjectionEntriesInStore(
  store: LearningCaptureQueueStore,
  input: {
    projectionVersion?: string
    eventId?: string
    syncedAt: string
    entries: MasteryProjectionResponse["entries"]
  },
) {
  const existing = await store.getProjectionCache()
  const byKey = new Map(
    existing.entries.map(entry => [`${entry.kind}:${entry.normalizedText}`, entry]),
  )
  for (const entry of input.entries) {
    byKey.set(`${entry.kind}:${entry.normalizedText}`, entry)
  }
  await store.replaceProjectionCache({
    projectionVersion: input.projectionVersion ?? existing.projectionVersion,
    eventId: input.eventId ?? existing.eventId,
    syncedAt: input.syncedAt,
    entries: [...byKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  })
}

export async function getLearningBridgeStatus(
  deps: LearningBridgeServiceDeps = {},
): Promise<LearningBridgeStatus> {
  const { store, client } = getDeps(deps)
  const [config, pendingCaptures] = await Promise.all([
    store.getConfig(),
    store.getPendingCaptures(),
  ])

  if (!config.enabled) {
    return {
      state: "disabled",
      connected: false,
      pendingCaptureCount: pendingCaptures.length,
    }
  }

  try {
    const daemon = await client.getHealth(config)
    const state = getHealthState(daemon)
    return {
      state,
      connected: state === "connected",
      pendingCaptureCount: pendingCaptures.length,
      daemon,
    }
  }
  catch (error) {
    return {
      state: "offline",
      connected: false,
      pendingCaptureCount: pendingCaptures.length,
      error: getErrorMessage(error),
    }
  }
}

export async function flushLearningBridgeQueue(
  deps: LearningBridgeServiceDeps = {},
): Promise<LearningBridgeFlushResult> {
  const { store, client } = getDeps(deps)
  const config = await store.getConfig()
  const pendingCaptures = await store.getPendingCaptures()

  if (!config.enabled) {
    return {
      status: "disabled",
      pendingCaptureCount: pendingCaptures.length,
      flushedCaptureCount: 0,
    }
  }

  let flushedCaptureCount = 0
  for (let index = 0; index < pendingCaptures.length; index += 1) {
    const capture = pendingCaptures[index]!
    try {
      await client.captureSelection(capture, config)
      flushedCaptureCount += 1
    }
    catch (error) {
      const remaining = pendingCaptures.slice(index)
      await store.replacePendingCaptures(remaining)
      return {
        status: "offline",
        pendingCaptureCount: remaining.length,
        flushedCaptureCount,
        error: getErrorMessage(error),
      }
    }
  }

  await store.replacePendingCaptures([])
  return {
    status: "flushed",
    pendingCaptureCount: 0,
    flushedCaptureCount,
  }
}

export async function getLearningProjectionTerms(
  terms: string[],
  deps: LearningBridgeServiceDeps = {},
): Promise<LearningBridgeProjectionTermsResult> {
  const { store, client, now } = getDeps(deps)
  const config = await store.getConfig()

  if (!config.enabled) {
    return {
      status: "disabled",
      entries: [],
    }
  }

  try {
    const health = await client.getHealth(config)
    if (getHealthState(health) !== "connected") {
      return {
        status: "incompatible",
        entries: [],
        error: `Expected contract ${LEARNING_CONTRACT_VERSION}, got ${health.contractVersion}`,
      }
    }

    const projection = await client.getProjectionTerms(terms, config)
    await upsertProjectionEntriesInStore(store, {
      projectionVersion: projection.projectionVersion,
      eventId: projection.eventId,
      syncedAt: now(),
      entries: projection.entries,
    })
    return {
      status: "ok",
      projectionVersion: projection.projectionVersion,
      entries: projection.entries,
    }
  }
  catch (error) {
    const cache = await store.getProjectionCache()
    const entries = getCachedProjectionEntriesForTerms(terms, cache.entries)
    if (entries.length > 0) {
      return {
        status: "cached",
        projectionVersion: cache.projectionVersion,
        entries,
        error: getErrorMessage(error),
      }
    }

    return {
      status: "offline",
      entries: [],
      error: getErrorMessage(error),
    }
  }
}

export async function syncLearningProjectionCache(
  deps: LearningBridgeServiceDeps = {},
): Promise<LearningBridgeProjectionSyncResult> {
  const { store, client, now } = getDeps(deps)
  const config = await store.getConfig()

  if (!config.enabled) {
    const cache = await store.getProjectionCache()
    return {
      status: "disabled",
      projectionVersion: cache.projectionVersion,
      entryCount: cache.entries.length,
    }
  }

  try {
    const health = await client.getHealth(config)
    if (getHealthState(health) !== "connected") {
      const cache = await store.getProjectionCache()
      return {
        status: "incompatible",
        projectionVersion: cache.projectionVersion,
        entryCount: cache.entries.length,
        error: `Expected contract ${LEARNING_CONTRACT_VERSION}, got ${health.contractVersion}`,
      }
    }

    const projection = await client.getProjection(config)
    await store.replaceProjectionCache({
      projectionVersion: projection.projectionVersion,
      eventId: projection.eventId,
      syncedAt: now(),
      entries: projection.entries,
    })
    return {
      status: "synced",
      projectionVersion: projection.projectionVersion,
      entryCount: projection.entries.length,
    }
  }
  catch (error) {
    const cache = await store.getProjectionCache()
    return {
      status: "offline",
      projectionVersion: cache.projectionVersion,
      entryCount: cache.entries.length,
      error: getErrorMessage(error),
    }
  }
}

export async function syncLearningCaptureSelection(
  input: LearningCaptureSelectionInput,
  deps: LearningBridgeServiceDeps = {},
): Promise<LearningBridgeCaptureResult> {
  const { store, client, now, createId } = getDeps(deps)
  const config = await store.getConfig()
  const capture = createLearningCaptureSelectionRequest(input, {
    id: createId(),
    now: now(),
  })

  if (!config.enabled) {
    const pendingCaptureCount = (await store.getPendingCaptures()).length
    return {
      status: "disabled",
      pendingCaptureCount,
      flushedCaptureCount: 0,
    }
  }

  const flushResult = await flushLearningBridgeQueue({ store, client })
  if (flushResult.status !== "flushed") {
    const pendingCaptures = await store.enqueueCapture(capture)
    return {
      status: "queued",
      pendingCaptureCount: pendingCaptures.length,
      flushedCaptureCount: flushResult.flushedCaptureCount,
      error: flushResult.error,
    }
  }

  try {
    await client.captureSelection(capture, config)
    return {
      status: "synced",
      pendingCaptureCount: 0,
      flushedCaptureCount: flushResult.flushedCaptureCount,
    }
  }
  catch (error) {
    const pendingCaptures = await store.enqueueCapture(capture)
    return {
      status: "queued",
      pendingCaptureCount: pendingCaptures.length,
      flushedCaptureCount: flushResult.flushedCaptureCount,
      error: getErrorMessage(error),
    }
  }
}
