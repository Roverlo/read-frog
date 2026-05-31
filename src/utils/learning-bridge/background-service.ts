import type {
  LearningBridgeCaptureResult,
  LearningBridgeConfig,
  LearningBridgeFlushResult,
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
import { getLearningDaemonHealth, getLearningMasteryProjectionTerms, postLearningCaptureSelection } from "./daemon-client"
import {
  enqueuePendingLearningCapture,
  getLearningBridgeConfig,
  getPendingLearningCaptures,
  replacePendingLearningCaptures,
} from "./storage"

export interface LearningDaemonBridgeClient {
  getHealth: (config: LearningBridgeConfig) => Promise<LearningDaemonHealthResponse>
  captureSelection: (capture: LearningCaptureSelectionRequest, config: LearningBridgeConfig) => Promise<unknown>
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
  const { store, client } = getDeps(deps)
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
    return {
      status: "ok",
      projectionVersion: projection.projectionVersion,
      entries: projection.entries,
    }
  }
  catch (error) {
    return {
      status: "offline",
      entries: [],
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
