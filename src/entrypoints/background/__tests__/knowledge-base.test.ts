import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const onMessageMock = vi.fn()
const ensureInitializedConfigMock = vi.fn()
const recordTranslationMemoryMock = vi.fn()
const getTranslationMemoryStatsMock = vi.fn()
const loggerWarnMock = vi.fn()

vi.mock("@/utils/message", () => ({
  onMessage: onMessageMock,
}))

vi.mock("../config", () => ({
  ensureInitializedConfig: ensureInitializedConfigMock,
}))

vi.mock("@/utils/knowledge-base/translation-memory", () => ({
  clearTranslationMemory: vi.fn(),
  exportTranslationMemory: vi.fn(),
  getTranslationMemoryStats: getTranslationMemoryStatsMock,
  recordTranslationMemory: recordTranslationMemoryMock,
  retryKnowledgeSyncQueue: vi.fn(),
  testKnowledgeBaseSync: vi.fn(),
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}))

vi.mock("#imports", () => ({
  browser: {
    alarms: {
      get: vi.fn(),
      create: vi.fn(),
      onAlarm: {
        addListener: vi.fn(),
      },
    },
  },
}))

function getRegisteredMessageHandler(name: string) {
  const registration = onMessageMock.mock.calls.find(call => call[0] === name)
  if (!registration) {
    throw new Error(`Message handler not registered: ${name}`)
  }
  return registration[1] as (message: { data: any }) => Promise<unknown>
}

describe("knowledge base background handlers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    ensureInitializedConfigMock.mockResolvedValue(DEFAULT_CONFIG)
    recordTranslationMemoryMock.mockResolvedValue(undefined)
    getTranslationMemoryStatsMock.mockResolvedValue({
      itemCount: 1,
      eventCount: 2,
      queuedSyncCount: 3,
    })
  })

  it("does not throw when config initialization fails before recording", async () => {
    ensureInitializedConfigMock.mockRejectedValueOnce(new Error("config init failed"))
    const { setupKnowledgeBaseMessageHandlers } = await import("../knowledge-base")
    setupKnowledgeBaseMessageHandlers()

    const handler = getRegisteredMessageHandler("recordTranslationMemory")

    await expect(handler({ data: {} })).resolves.toBeUndefined()
    expect(recordTranslationMemoryMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  it("does not throw when translation memory recording fails", async () => {
    recordTranslationMemoryMock.mockRejectedValueOnce(new Error("memory write failed"))
    const { setupKnowledgeBaseMessageHandlers } = await import("../knowledge-base")
    setupKnowledgeBaseMessageHandlers()

    const handler = getRegisteredMessageHandler("recordTranslationMemory")

    await expect(handler({ data: {} })).resolves.toBeUndefined()
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  it("returns empty stats when translation memory stats fail", async () => {
    getTranslationMemoryStatsMock.mockRejectedValueOnce(new Error("stats failed"))
    const { setupKnowledgeBaseMessageHandlers } = await import("../knowledge-base")
    setupKnowledgeBaseMessageHandlers()

    const handler = getRegisteredMessageHandler("getTranslationMemoryStats")

    await expect(handler({ data: undefined })).resolves.toEqual({
      itemCount: 0,
      eventCount: 0,
      queuedSyncCount: 0,
    })
    expect(loggerWarnMock).toHaveBeenCalled()
  })

})
