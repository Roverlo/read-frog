import type {
  LearningBridgeConfig,
  LearningBridgeProjectionCache,
  LearningCaptureQueueStore,
} from "../types"
import type {
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
  MasteryProjectionEntry,
} from "@/utils/learning-contracts"
import { beforeEach, describe, expect, it, vi } from "vitest"

const config: LearningBridgeConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:7457",
}

function createHealth(overrides: Partial<LearningDaemonHealthResponse> = {}): LearningDaemonHealthResponse {
  return {
    ok: true,
    service: "read-frog-learning-daemon",
    contractVersion: 1,
    projectionVersion: "projection-1",
    ...overrides,
  }
}

function createProjectionEntry(overrides: Partial<MasteryProjectionEntry> = {}): MasteryProjectionEntry {
  return {
    normalizedText: "workflow",
    kind: "word",
    status: "learning",
    confidence: 0.35,
    definition: "workflow definition",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }
}

function createStore(
  seed: LearningCaptureSelectionRequest[] = [],
  cacheSeed?: LearningBridgeProjectionCache,
) {
  let pending = [...seed]
  let projectionCache: LearningBridgeProjectionCache = cacheSeed ?? {
    projectionVersion: undefined,
    entries: [],
  }
  const store: LearningCaptureQueueStore = {
    getConfig: vi.fn(async () => config),
    getPendingCaptures: vi.fn(async () => pending),
    replacePendingCaptures: vi.fn(async (captures) => {
      pending = [...captures]
    }),
    enqueueCapture: vi.fn(async (capture) => {
      pending = [...pending, capture]
      return pending
    }),
    getProjectionCache: vi.fn(async () => projectionCache),
    replaceProjectionCache: vi.fn(async (cache) => {
      projectionCache = { ...cache, entries: [...cache.entries] }
    }),
  }
  return {
    store,
    getPending: () => pending,
    getProjectionCache: () => projectionCache,
  }
}

describe("learning bridge background service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reports a connected daemon when health matches the contract version", async () => {
    const { getLearningBridgeStatus } = await import("../background-service")
    const { store } = createStore()
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(getLearningBridgeStatus({ store, client })).resolves.toEqual({
      state: "connected",
      connected: true,
      pendingCaptureCount: 0,
      daemon: createHealth(),
    })
  })

  it("queues a capture when the daemon is offline", async () => {
    const { syncLearningCaptureSelection } = await import("../background-service")
    const { store, getPending } = createStore()
    const client = {
      getHealth: vi.fn(),
      captureSelection: vi.fn(async () => {
        throw new Error("daemon offline")
      }),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    const result = await syncLearningCaptureSelection({
      text: "workflow",
      context: "A workflow is a repeatable process.",
    }, {
      store,
      client,
      now: () => "2026-06-01T00:00:00.000Z",
      createId: () => "capture-1",
    })

    expect(result).toEqual({
      status: "queued",
      pendingCaptureCount: 1,
      flushedCaptureCount: 0,
      error: "daemon offline",
    })
    expect(getPending()).toMatchObject([{
      id: "capture-1",
      text: "workflow",
      context: "A workflow is a repeatable process.",
      createdAt: "2026-06-01T00:00:00.000Z",
    }])
  })

  it("flushes queued captures before syncing the newest capture", async () => {
    const { syncLearningCaptureSelection } = await import("../background-service")
    const queued: LearningCaptureSelectionRequest = {
      id: "queued-1",
      text: "ability",
      createdAt: "2026-05-31T00:00:00.000Z",
      extractedItems: [],
    }
    const { store, getPending } = createStore([queued])
    const syncedIds: string[] = []
    const client = {
      getHealth: vi.fn(),
      captureSelection: vi.fn(async (capture: LearningCaptureSelectionRequest) => {
        syncedIds.push(capture.id)
      }),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    const result = await syncLearningCaptureSelection({
      text: "workflow",
    }, {
      store,
      client,
      now: () => "2026-06-01T00:00:00.000Z",
      createId: () => "capture-2",
    })

    expect(result).toEqual({
      status: "synced",
      pendingCaptureCount: 0,
      flushedCaptureCount: 1,
    })
    expect(syncedIds).toEqual(["queued-1", "capture-2"])
    expect(getPending()).toEqual([])
  })

  it("returns projection entries from a connected daemon and updates the local projection cache", async () => {
    const { getLearningProjectionTerms } = await import("../background-service")
    const { store, getProjectionCache } = createStore()
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(async (terms: string[]) => ({
        ok: true as const,
        projectionVersion: "projection-2",
        eventId: "event-2",
        entries: terms.map(term => createProjectionEntry({
          normalizedText: term,
          definition: "daemon definition",
        })),
      })),
    }

    await expect(getLearningProjectionTerms(["workflow"], {
      store,
      client,
      now: () => "2026-06-01T00:01:00.000Z",
    })).resolves.toEqual({
      status: "ok",
      projectionVersion: "projection-2",
      entries: [
        createProjectionEntry({ definition: "daemon definition" }),
      ],
    })
    expect(getProjectionCache()).toMatchObject({
      projectionVersion: "projection-2",
      eventId: "event-2",
      syncedAt: "2026-06-01T00:01:00.000Z",
      entries: [
        {
          normalizedText: "workflow",
          definition: "daemon definition",
        },
      ],
    })
  })

  it("returns an offline projection result when the daemon cannot be reached and cache misses", async () => {
    const { getLearningProjectionTerms } = await import("../background-service")
    const { store } = createStore()
    const client = {
      getHealth: vi.fn(async () => {
        throw new Error("daemon offline")
      }),
      captureSelection: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(getLearningProjectionTerms(["workflow"], { store, client })).resolves.toEqual({
      status: "offline",
      entries: [],
      error: "daemon offline",
    })
  })

  it("returns cached projection entries when the daemon is offline", async () => {
    const { getLearningProjectionTerms } = await import("../background-service")
    const cachedWorkflow = createProjectionEntry({
      normalizedText: "workflow",
      status: "mature",
      confidence: 0.98,
    })
    const { store } = createStore([], {
      projectionVersion: "projection-cached",
      syncedAt: "2026-06-01T00:00:00.000Z",
      entries: [
        cachedWorkflow,
        createProjectionEntry({
          normalizedText: "ability",
          definition: "ability definition",
        }),
      ],
    })
    const client = {
      getHealth: vi.fn(async () => {
        throw new Error("daemon offline")
      }),
      captureSelection: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(getLearningProjectionTerms(["workflow", "missing"], { store, client })).resolves.toEqual({
      status: "cached",
      projectionVersion: "projection-cached",
      entries: [cachedWorkflow],
      error: "daemon offline",
    })
  })

  it("syncs the full daemon projection into extension cache", async () => {
    const { syncLearningProjectionCache } = await import("../background-service")
    const { store, getProjectionCache } = createStore()
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      getProjection: vi.fn(async () => ({
        ok: true as const,
        projectionVersion: "projection-3",
        eventId: "event-3",
        entries: [
          createProjectionEntry({ normalizedText: "workflow" }),
          createProjectionEntry({ normalizedText: "constraint" }),
        ],
      })),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningProjectionCache({
      store,
      client,
      now: () => "2026-06-01T00:03:00.000Z",
    })).resolves.toEqual({
      status: "synced",
      projectionVersion: "projection-3",
      entryCount: 2,
    })
    expect(getProjectionCache()).toMatchObject({
      projectionVersion: "projection-3",
      eventId: "event-3",
      syncedAt: "2026-06-01T00:03:00.000Z",
      entries: [
        { normalizedText: "workflow" },
        { normalizedText: "constraint" },
      ],
    })
  })
})
