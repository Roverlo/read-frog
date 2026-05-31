import type { LearningBridgeConfig, LearningCaptureQueueStore } from "../types"
import type { LearningCaptureSelectionRequest, LearningDaemonHealthResponse } from "@/utils/learning-contracts"
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

function createStore(seed: LearningCaptureSelectionRequest[] = []) {
  let pending = [...seed]
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
  }
  return { store, getPending: () => pending }
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
})
