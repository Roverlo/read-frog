import type { LearningItem } from "@/types/learning"
import { beforeEach, describe, expect, it, vi } from "vitest"

type MockLearningItem = Partial<LearningItem> & {
  id: string
  text: string
  createdAt: Date
  updatedAt: Date
}

const mockLocalItems: MockLearningItem[] = []
const mockRemotePuts: MockLearningItem[] = []

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    learningItems: {
      toArray: vi.fn(async () => mockLocalItems),
      get: vi.fn(async (id: string) => mockLocalItems.find(item => item.id === id)),
      put: vi.fn(async (item: MockLearningItem) => {
        mockRemotePuts.push(item)
      }),
    },
    vocabTestSessions: {
      toArray: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      put: vi.fn(),
    },
    reviewSessions: {
      toArray: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      put: vi.fn(),
    },
    transaction: vi.fn(async (_mode: string, _a: unknown, _b: unknown, _c: unknown, callback: () => Promise<void>) => {
      await callback()
    }),
  },
}))

describe("learning export merge", () => {
  beforeEach(() => {
    mockLocalItems.length = 0
    mockRemotePuts.length = 0
    vi.clearAllMocks()
  })

  it("keeps the newer item during merge", async () => {
    const { mergeLearningData } = await import("../export")
    mockLocalItems.push({
      id: "same",
      text: "local",
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })

    await mergeLearningData({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      items: [{
        id: "same",
        kind: "word",
        text: "remote",
        normalizedText: "remote",
        status: "learning",
        source: "manual",
        consecutivePasses: 0,
        reviewCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      vocabTestSessions: [],
      reviewSessions: [],
    })

    expect(mockRemotePuts[0].text).toBe("local")
  })
})
