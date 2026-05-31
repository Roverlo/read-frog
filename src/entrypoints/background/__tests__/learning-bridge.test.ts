import { beforeEach, describe, expect, it, vi } from "vitest"

const onMessageMock = vi.fn()
const getLearningBridgeStatusMock = vi.fn()
const syncLearningCaptureSelectionMock = vi.fn()
const flushLearningBridgeQueueMock = vi.fn()

vi.mock("@/utils/message", () => ({
  onMessage: onMessageMock,
}))

vi.mock("@/utils/learning-bridge", () => ({
  getLearningBridgeStatus: getLearningBridgeStatusMock,
  syncLearningCaptureSelection: syncLearningCaptureSelectionMock,
  flushLearningBridgeQueue: flushLearningBridgeQueueMock,
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

    await expect(getRegisteredMessageHandler("getLearningBridgeStatus")({ data: {} })).resolves.toEqual({ state: "offline" })
    await expect(getRegisteredMessageHandler("syncLearningCaptureSelection")({
      data: { text: "workflow" },
    })).resolves.toEqual({ status: "queued" })
    await expect(getRegisteredMessageHandler("flushLearningBridgeQueue")({ data: {} })).resolves.toEqual({ status: "flushed" })

    expect(syncLearningCaptureSelectionMock).toHaveBeenCalledWith({ text: "workflow" })
  })
})
