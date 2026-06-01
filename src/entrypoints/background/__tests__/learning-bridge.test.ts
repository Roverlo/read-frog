import { beforeEach, describe, expect, it, vi } from "vitest"

const onMessageMock = vi.fn()
const getLearningBridgeStatusMock = vi.fn()
const syncLearningCaptureSelectionMock = vi.fn()
const flushLearningBridgeQueueMock = vi.fn()
const getLearningProjectionTermsMock = vi.fn()
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
  flushLearningBridgeQueue: flushLearningBridgeQueueMock,
  getLearningProjectionTerms: getLearningProjectionTermsMock,
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
    setupLearningBridgeMessageHandlers()

    getLearningBridgeStatusMock.mockResolvedValue({ state: "offline" })
    syncLearningCaptureSelectionMock.mockResolvedValue({ status: "queued" })
    flushLearningBridgeQueueMock.mockResolvedValue({ status: "flushed" })
    getLearningProjectionTermsMock.mockResolvedValue({ status: "ok", entries: [] })
    syncLearningProjectionCacheMock.mockResolvedValue({ status: "synced", entryCount: 1, changed: false })

    await expect(getRegisteredMessageHandler("getLearningBridgeStatus")({ data: {} })).resolves.toEqual({ state: "offline" })
    await expect(getRegisteredMessageHandler("syncLearningCaptureSelection")({
      data: { text: "workflow" },
    })).resolves.toEqual({ status: "queued" })
    await expect(getRegisteredMessageHandler("flushLearningBridgeQueue")({ data: {} })).resolves.toEqual({ status: "flushed" })
    await expect(getRegisteredMessageHandler("getLearningProjectionTerms")({
      data: { terms: ["workflow"] },
    })).resolves.toEqual({ status: "ok", entries: [] })
    await expect(getRegisteredMessageHandler("syncLearningProjectionCache")({ data: {} })).resolves.toEqual({ status: "synced", entryCount: 1, changed: false })

    expect(syncLearningCaptureSelectionMock).toHaveBeenCalledWith({ text: "workflow" })
    expect(getLearningProjectionTermsMock).toHaveBeenCalledWith(["workflow"])
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
