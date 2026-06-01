import type {
  LearningBridgeConfig,
  LearningBridgeProjectionCache,
  LearningCaptureQueueStore,
} from "../types"
import type {
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
  LearningQwertyChapterRecordRequest,
  LearningQwertyWordRecordRequest,
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
  qwertyWordSeed: LearningQwertyWordRecordRequest[] = [],
  qwertyChapterSeed: LearningQwertyChapterRecordRequest[] = [],
) {
  let pending = [...seed]
  let pendingQwertyWordRecords = [...qwertyWordSeed]
  let pendingQwertyChapterRecords = [...qwertyChapterSeed]
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
    getPendingQwertyWordRecords: vi.fn(async () => pendingQwertyWordRecords),
    replacePendingQwertyWordRecords: vi.fn(async (records) => {
      pendingQwertyWordRecords = [...records]
    }),
    enqueueQwertyWordRecord: vi.fn(async (record) => {
      pendingQwertyWordRecords = [...pendingQwertyWordRecords, record]
      return pendingQwertyWordRecords
    }),
    getPendingQwertyChapterRecords: vi.fn(async () => pendingQwertyChapterRecords),
    replacePendingQwertyChapterRecords: vi.fn(async (records) => {
      pendingQwertyChapterRecords = [...records]
    }),
    enqueueQwertyChapterRecord: vi.fn(async (record) => {
      pendingQwertyChapterRecords = [...pendingQwertyChapterRecords, record]
      return pendingQwertyChapterRecords
    }),
    getProjectionCache: vi.fn(async () => projectionCache),
    replaceProjectionCache: vi.fn(async (cache) => {
      projectionCache = { ...cache, entries: [...cache.entries] }
    }),
  }
  return {
    store,
    getPending: () => pending,
    getPendingQwertyWordRecords: () => pendingQwertyWordRecords,
    getPendingQwertyChapterRecords: () => pendingQwertyChapterRecords,
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(getLearningBridgeStatus({ store, client })).resolves.toEqual({
      state: "connected",
      connected: true,
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
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
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
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
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
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
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
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
      changed: true,
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

  it("marks a full projection cache sync unchanged when the projection version is stable", async () => {
    const { syncLearningProjectionCache } = await import("../background-service")
    const { store } = createStore([], {
      projectionVersion: "projection-3",
      eventId: "event-previous",
      syncedAt: "2026-06-01T00:02:00.000Z",
      entries: [
        createProjectionEntry({ normalizedText: "workflow" }),
      ],
    })
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(async () => ({
        ok: true as const,
        projectionVersion: "projection-3",
        eventId: "event-3",
        entries: [
          createProjectionEntry({ normalizedText: "workflow" }),
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
      entryCount: 1,
      changed: false,
    })
  })

  it("records qwerty word results through the connected daemon", async () => {
    const { syncLearningQwertyWordRecord } = await import("../background-service")
    const { store } = createStore()
    const response = {
      ok: true as const,
      itemId: "workflow:qwerty:1",
      projectionVersion: "projection-4",
      entry: createProjectionEntry({
        normalizedText: "workflow",
        status: "review",
        confidence: 0.72,
      }),
    }
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(async () => response),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningQwertyWordRecord({
      word: "workflow",
      input: "workflow",
      correct: true,
      accuracy: 1,
      durationMs: 1200,
      mistakes: [],
    }, {
      store,
      client,
    })).resolves.toEqual({
      status: "synced",
      pendingQwertyWordRecordCount: 0,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
      response,
    })
    expect(client.recordQwertyWord).toHaveBeenCalledWith(expect.objectContaining({
      word: "workflow",
      accuracy: 1,
    }), config)
  })

  it("queues qwerty word results when queued bridge records cannot flush", async () => {
    const { syncLearningQwertyWordRecord } = await import("../background-service")
    const queuedRecord: LearningQwertyWordRecordRequest = {
      word: "ability",
      input: "ability",
      correct: true,
      accuracy: 1,
      durationMs: 1000,
      mistakes: [],
    }
    const { store, getPendingQwertyWordRecords } = createStore([], undefined, [queuedRecord])
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(async () => {
        throw new Error("daemon offline")
      }),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningQwertyWordRecord({
      word: "workflow",
      input: "workflow",
      correct: true,
      accuracy: 1,
      durationMs: 1200,
      mistakes: [],
    }, {
      store,
      client,
    })).resolves.toEqual({
      status: "queued",
      pendingQwertyWordRecordCount: 2,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
      error: "daemon offline",
    })
    expect(getPendingQwertyWordRecords()).toEqual([
      queuedRecord,
      expect.objectContaining({ word: "workflow" }),
    ])
  })

  it("does not record qwerty word results when the bridge is disabled", async () => {
    const { syncLearningQwertyWordRecord } = await import("../background-service")
    const { store } = createStore()
    vi.mocked(store.getConfig).mockResolvedValue({
      ...config,
      enabled: false,
    })
    const client = {
      getHealth: vi.fn(),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningQwertyWordRecord({
      word: "workflow",
      input: "workflow",
      correct: true,
      accuracy: 1,
      durationMs: 1200,
      mistakes: [],
    }, {
      store,
      client,
    })).resolves.toEqual({
      status: "disabled",
    })
    expect(client.recordQwertyWord).not.toHaveBeenCalled()
  })

  it("records qwerty chapter results through the connected daemon", async () => {
    const { syncLearningQwertyChapterRecord } = await import("../background-service")
    const { store } = createStore()
    const response = {
      ok: true as const,
      recordId: "cet4:chapter:0:1",
      projectionVersion: "projection-5",
    }
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(async () => response),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningQwertyChapterRecord({
      dictId: "cet4",
      dictName: "CET-4",
      chapterIndex: 0,
      durationMs: 90000,
      wordCount: 20,
      correctCount: 18,
      wrongCount: 2,
      accuracy: 0.9,
      correctWordIndexes: [0, 1, 2],
    }, {
      store,
      client,
    })).resolves.toEqual({
      status: "synced",
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
      response,
    })
    expect(client.recordQwertyChapter).toHaveBeenCalledWith(expect.objectContaining({
      dictId: "cet4",
      chapterIndex: 0,
      accuracy: 0.9,
    }), config)
  })

  it("queues qwerty chapter results when the daemon is offline", async () => {
    const { syncLearningQwertyChapterRecord } = await import("../background-service")
    const { store, getPendingQwertyChapterRecords } = createStore()
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(async () => {
        throw new Error("daemon offline")
      }),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningQwertyChapterRecord({
      dictId: "cet4",
      chapterIndex: 0,
      durationMs: 90000,
      wordCount: 20,
      correctCount: 18,
      wrongCount: 2,
      accuracy: 0.9,
      correctWordIndexes: [0, 1, 2],
    }, {
      store,
      client,
    })).resolves.toEqual({
      status: "queued",
      pendingQwertyChapterRecordCount: 1,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
      error: "daemon offline",
    })
    expect(getPendingQwertyChapterRecords()).toEqual([
      expect.objectContaining({ dictId: "cet4", chapterIndex: 0 }),
    ])
  })

  it("does not record qwerty chapter results when the bridge is disabled", async () => {
    const { syncLearningQwertyChapterRecord } = await import("../background-service")
    const { store } = createStore()
    vi.mocked(store.getConfig).mockResolvedValue({
      ...config,
      enabled: false,
    })
    const client = {
      getHealth: vi.fn(),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(syncLearningQwertyChapterRecord({
      dictId: "cet4",
      chapterIndex: 0,
      durationMs: 90000,
      wordCount: 20,
      correctCount: 18,
      wrongCount: 2,
      accuracy: 0.9,
      correctWordIndexes: [0, 1, 2],
    }, {
      store,
      client,
    })).resolves.toEqual({
      status: "disabled",
    })
    expect(client.recordQwertyChapter).not.toHaveBeenCalled()
  })

  it("reads workspace state through the connected daemon", async () => {
    const { getLearningWorkspaceStateFromDaemon } = await import("../background-service")
    const { store } = createStore()
    const state = {
      ok: true as const,
      projectionVersion: "projection-4",
      stats: {
        captureCount: 0,
        qwertyRecordCount: 2,
        qwertyChapterRecordCount: 0,
        correctQwertyRecordCount: 1,
        projectionEntryCount: 1,
        unknownCount: 0,
        learningCount: 1,
        reviewCount: 0,
        matureCount: 0,
        archivedCount: 0,
        averageAccuracy: 0.75,
      },
      captures: [],
      qwertyWordRecords: [],
      qwertyChapterRecords: [],
      qwertyMistakes: {
        words: [],
        keys: [],
      },
    }
    const client = {
      getHealth: vi.fn(async () => createHealth()),
      captureSelection: vi.fn(),
      recordQwertyWord: vi.fn(),
      recordQwertyChapter: vi.fn(),
      getWorkspaceState: vi.fn(async () => state),
      getProjection: vi.fn(),
      getProjectionTerms: vi.fn(),
    }

    await expect(getLearningWorkspaceStateFromDaemon({
      store,
      client,
    })).resolves.toEqual({
      status: "ok",
      state,
    })
    expect(client.getWorkspaceState).toHaveBeenCalledWith(config)
  })
})
