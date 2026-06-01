import { beforeEach, describe, expect, it, vi } from "vitest"

const onMessageMock = vi.fn()
const getLearningBridgeStatusMock = vi.fn()
const syncLearningCaptureSelectionMock = vi.fn()
const syncLearningQwertyWordRecordMock = vi.fn()
const syncLearningQwertyChapterRecordMock = vi.fn()
const flushLearningBridgeQueueMock = vi.fn()
const getLearningProjectionTermsMock = vi.fn()
const getLearningWorkspaceStateFromDaemonMock = vi.fn()
const syncLearningProjectionCacheMock = vi.fn()
const sendMessageMock = vi.fn()
const getPageTranslationEnabledMock = vi.fn()
const tabsQueryMock = vi.fn()
const alarmsGetMock = vi.fn()
const alarmsCreateMock = vi.fn()
const alarmsAddListenerMock = vi.fn()

vi.mock("@/utils/message", () => ({
  onMessage: onMessageMock,
  sendMessage: sendMessageMock,
}))

vi.mock("#imports", () => ({
  browser: {
    alarms: {
      get: alarmsGetMock,
      create: alarmsCreateMock,
      onAlarm: {
        addListener: alarmsAddListenerMock,
      },
    },
    tabs: {
      query: tabsQueryMock,
    },
  },
}))

vi.mock("@/utils/learning-bridge", () => ({
  getLearningBridgeStatus: getLearningBridgeStatusMock,
  syncLearningCaptureSelection: syncLearningCaptureSelectionMock,
  syncLearningQwertyWordRecord: syncLearningQwertyWordRecordMock,
  syncLearningQwertyChapterRecord: syncLearningQwertyChapterRecordMock,
  flushLearningBridgeQueue: flushLearningBridgeQueueMock,
  getLearningProjectionTerms: getLearningProjectionTermsMock,
  getLearningWorkspaceStateFromDaemon: getLearningWorkspaceStateFromDaemonMock,
  syncLearningProjectionCache: syncLearningProjectionCacheMock,
}))

vi.mock("../page-translation-state", () => ({
  getPageTranslationEnabled: getPageTranslationEnabledMock,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}))

function getRegisteredMessageHandler(name: string) {
  const registration = onMessageMock.mock.calls.find(call => call[0] === name)
  if (!registration) {
    throw new Error(`Message handler not registered: ${name}`)
  }
  return registration[1] as (message: { data: Record<string, unknown> }) => Promise<unknown>
}

describe("background learning bridge", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("registers bridge message handlers", async () => {
    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    getLearningBridgeStatusMock.mockResolvedValue({ state: "offline" })
    syncLearningCaptureSelectionMock.mockResolvedValue({ status: "queued" })
    syncLearningQwertyWordRecordMock.mockResolvedValue({ status: "synced" })
    syncLearningQwertyChapterRecordMock.mockResolvedValue({ status: "synced" })
    flushLearningBridgeQueueMock.mockResolvedValue({
      status: "flushed",
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
    })
    getLearningProjectionTermsMock.mockResolvedValue({ status: "ok", entries: [] })
    getLearningWorkspaceStateFromDaemonMock.mockResolvedValue({ status: "ok", state: { ok: true } })
    syncLearningProjectionCacheMock.mockResolvedValue({ status: "synced", entryCount: 1, changed: false })

    await expect(getRegisteredMessageHandler("getLearningBridgeStatus")({ data: {} })).resolves.toEqual({ state: "offline" })
    await expect(getRegisteredMessageHandler("syncLearningCaptureSelection")({
      data: { text: "workflow" },
    })).resolves.toEqual({ status: "queued" })
    await expect(getRegisteredMessageHandler("syncLearningQwertyWordRecord")({
      data: { word: "workflow" },
    })).resolves.toEqual({ status: "synced" })
    await expect(getRegisteredMessageHandler("syncLearningQwertyChapterRecord")({
      data: { dictId: "cet4", chapterIndex: 0 },
    })).resolves.toEqual({ status: "synced" })
    await expect(getRegisteredMessageHandler("flushLearningBridgeQueue")({ data: {} })).resolves.toEqual({
      status: "flushed",
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
    })
    await expect(getRegisteredMessageHandler("getLearningProjectionTerms")({
      data: { terms: ["workflow"] },
    })).resolves.toEqual({ status: "ok", entries: [] })
    await expect(getRegisteredMessageHandler("getLearningWorkspaceState")({ data: {} })).resolves.toEqual({
      status: "ok",
      state: { ok: true },
    })
    await expect(getRegisteredMessageHandler("syncLearningProjectionCache")({ data: {} })).resolves.toEqual({ status: "synced", entryCount: 1, changed: false })

    expect(syncLearningCaptureSelectionMock).toHaveBeenCalledWith({ text: "workflow" })
    expect(syncLearningQwertyWordRecordMock).toHaveBeenCalledWith({ word: "workflow" })
    expect(syncLearningQwertyChapterRecordMock).toHaveBeenCalledWith({ dictId: "cet4", chapterIndex: 0 })
    expect(getLearningProjectionTermsMock).toHaveBeenCalledWith(["workflow"])
    expect(getLearningWorkspaceStateFromDaemonMock).toHaveBeenCalledOnce()
  })

  it("syncs projection and refreshes translated tabs after a capture is written to the daemon", async () => {
    syncLearningCaptureSelectionMock.mockResolvedValue({
      status: "synced",
      pendingCaptureCount: 0,
      flushedCaptureCount: 0,
    })
    syncLearningProjectionCacheMock.mockResolvedValue({
      status: "synced",
      entryCount: 3,
      changed: true,
    })
    getPageTranslationEnabledMock.mockImplementation(async (tabId: number) => tabId === 42)
    tabsQueryMock.mockResolvedValue([
      { id: 41 },
      { id: 42 },
    ])
    sendMessageMock.mockResolvedValue(undefined)

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("syncLearningCaptureSelection")({
      data: { text: "workflow" },
    })).resolves.toEqual({
      status: "synced",
      pendingCaptureCount: 0,
      flushedCaptureCount: 0,
    })

    expect(syncLearningProjectionCacheMock).toHaveBeenCalledOnce()
    expect(sendMessageMock).toHaveBeenCalledWith("refreshLearningPageTranslation", undefined, 42)
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it("does not refresh translated tabs after a queued capture", async () => {
    syncLearningCaptureSelectionMock.mockResolvedValue({
      status: "queued",
      pendingCaptureCount: 1,
      flushedCaptureCount: 0,
    })

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("syncLearningCaptureSelection")({
      data: { text: "workflow" },
    })).resolves.toEqual({
      status: "queued",
      pendingCaptureCount: 1,
      flushedCaptureCount: 0,
    })

    expect(syncLearningProjectionCacheMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("syncs projection and refreshes translated tabs after a qwerty word record is written to the daemon", async () => {
    syncLearningQwertyWordRecordMock.mockResolvedValue({
      status: "synced",
    })
    syncLearningProjectionCacheMock.mockResolvedValue({
      status: "synced",
      entryCount: 3,
      changed: true,
    })
    getPageTranslationEnabledMock.mockImplementation(async (tabId: number) => tabId === 42)
    tabsQueryMock.mockResolvedValue([
      { id: 41 },
      { id: 42 },
    ])
    sendMessageMock.mockResolvedValue(undefined)

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("syncLearningQwertyWordRecord")({
      data: { word: "workflow" },
    })).resolves.toEqual({
      status: "synced",
    })

    expect(syncLearningProjectionCacheMock).toHaveBeenCalledOnce()
    expect(sendMessageMock).toHaveBeenCalledWith("refreshLearningPageTranslation", undefined, 42)
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it("does not refresh translated tabs after a queued qwerty word record", async () => {
    syncLearningQwertyWordRecordMock.mockResolvedValue({
      status: "queued",
    })

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("syncLearningQwertyWordRecord")({
      data: { word: "workflow" },
    })).resolves.toEqual({
      status: "queued",
    })

    expect(syncLearningProjectionCacheMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("does not refresh translated tabs after a qwerty chapter record", async () => {
    syncLearningQwertyChapterRecordMock.mockResolvedValue({
      status: "synced",
    })

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("syncLearningQwertyChapterRecord")({
      data: { dictId: "cet4", chapterIndex: 0 },
    })).resolves.toEqual({
      status: "synced",
    })

    expect(syncLearningQwertyChapterRecordMock).toHaveBeenCalledWith({ dictId: "cet4", chapterIndex: 0 })
    expect(syncLearningProjectionCacheMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("syncs projection and refreshes translated tabs after queued captures flush", async () => {
    flushLearningBridgeQueueMock.mockResolvedValue({
      status: "flushed",
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 2,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
    })
    syncLearningProjectionCacheMock.mockResolvedValue({
      status: "synced",
      entryCount: 5,
      changed: true,
    })
    getPageTranslationEnabledMock.mockResolvedValue(true)
    tabsQueryMock.mockResolvedValue([{ id: 42 }])
    sendMessageMock.mockResolvedValue(undefined)

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("flushLearningBridgeQueue")({ data: {} })).resolves.toEqual({
      status: "flushed",
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 2,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
    })

    expect(syncLearningProjectionCacheMock).toHaveBeenCalledOnce()
    expect(sendMessageMock).toHaveBeenCalledWith("refreshLearningPageTranslation", undefined, 42)
  })

  it("does not sync projection after an empty queue flush", async () => {
    flushLearningBridgeQueueMock.mockResolvedValue({
      status: "flushed",
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
    })

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers({
      query: tabsQueryMock,
    } as never)

    await expect(getRegisteredMessageHandler("flushLearningBridgeQueue")({ data: {} })).resolves.toEqual({
      status: "flushed",
      pendingCaptureCount: 0,
      pendingQwertyWordRecordCount: 0,
      pendingQwertyChapterRecordCount: 0,
      flushedCaptureCount: 0,
      flushedQwertyWordRecordCount: 0,
      flushedQwertyChapterRecordCount: 0,
    })

    expect(syncLearningProjectionCacheMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("registers a projection sync alarm and notifies translated tabs when a matching alarm changes projection", async () => {
    alarmsGetMock.mockResolvedValue(null)
    alarmsCreateMock.mockResolvedValue(undefined)
    syncLearningProjectionCacheMock.mockResolvedValue({ status: "synced", entryCount: 1, changed: true })
    getPageTranslationEnabledMock.mockImplementation(async (tabId: number) => tabId === 42)
    sendMessageMock.mockResolvedValue(undefined)
    let alarmListener: ((alarm: { name: string }) => void) | undefined
    alarmsAddListenerMock.mockImplementation((listener: (alarm: { name: string }) => void) => {
      alarmListener = listener
    })
    tabsQueryMock.mockResolvedValue([
      { id: 41 },
      { id: 42 },
      { id: undefined },
    ])

    const {
      LEARNING_PROJECTION_SYNC_ALARM,
      LEARNING_PROJECTION_SYNC_INTERVAL_MINUTES,
      setupLearningProjectionSyncAlarm,
    } = await import("../learning-bridge")

    await setupLearningProjectionSyncAlarm({
      get: alarmsGetMock,
      create: alarmsCreateMock,
      onAlarm: {
        addListener: alarmsAddListenerMock,
      },
    } as never, {
      query: tabsQueryMock,
    } as never)

    expect(alarmsCreateMock).toHaveBeenCalledWith(LEARNING_PROJECTION_SYNC_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: LEARNING_PROJECTION_SYNC_INTERVAL_MINUTES,
    })
    expect(alarmsAddListenerMock).toHaveBeenCalledTimes(1)
    if (!alarmListener) {
      throw new Error("Expected learning projection alarm listener")
    }

    alarmListener({ name: "other-alarm" })
    expect(syncLearningProjectionCacheMock).not.toHaveBeenCalled()

    alarmListener({ name: LEARNING_PROJECTION_SYNC_ALARM })
    await vi.waitFor(() => {
      expect(syncLearningProjectionCacheMock).toHaveBeenCalledTimes(1)
      expect(sendMessageMock).toHaveBeenCalledWith("refreshLearningPageTranslation", undefined, 42)
    })
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it("does not notify translated tabs when projection sync is unchanged", async () => {
    syncLearningProjectionCacheMock.mockResolvedValue({ status: "synced", entryCount: 1, changed: false })
    getPageTranslationEnabledMock.mockResolvedValue(true)

    const { setupLearningBridgeMessageHandlers } = await import("../learning-bridge")
    setupLearningBridgeMessageHandlers()

    await expect(getRegisteredMessageHandler("syncLearningProjectionCache")({ data: {} })).resolves.toEqual({
      status: "synced",
      entryCount: 1,
      changed: false,
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})
