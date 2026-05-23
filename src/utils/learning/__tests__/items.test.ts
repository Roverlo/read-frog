import { beforeEach, describe, expect, it, vi } from "vitest"

interface MockLearningRow {
  id: string
  kind?: string
  status: string
  srsCard?: unknown
  dueAt?: Date
  lastReviewAt?: Date
  lastRating?: string
  maturity?: string
  tags?: string[]
  createdAt?: Date
  consecutivePasses: number
  reviewCount: number
  correctCount: number
  incorrectCount: number
  updatedAt: Date
  [key: string]: unknown
}

const mockRows: MockLearningRow[] = []
const addMock = vi.fn(async (item: MockLearningRow) => {
  mockRows.push(item)
})
const putMock = vi.fn(async (item: MockLearningRow) => {
  const index = mockRows.findIndex(row => row.id === item.id)
  if (index >= 0) {
    mockRows[index] = item
  }
  else {
    mockRows.push(item)
  }
})
const getMock = vi.fn(async (id: string) => mockRows.find(row => row.id === id))
const firstMock = vi.fn(async (): Promise<MockLearningRow | undefined> => mockRows[0])
const equalsMock = vi.fn(() => ({ first: firstMock }))
const whereMock = vi.fn(() => ({ equals: equalsMock }))

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    learningItems: {
      add: addMock,
      put: putMock,
      get: getMock,
      where: whereMock,
      count: vi.fn(),
    },
    learningReviewLogs: {
      add: vi.fn(),
    },
    transaction: vi.fn(async (_mode: string, ...args: unknown[]) => {
      const callback = args.at(-1) as () => Promise<void>
      await callback()
    }),
  },
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: vi.fn(() => "item-id"),
}))

describe("learning items", () => {
  beforeEach(() => {
    mockRows.length = 0
    vi.clearAllMocks()
    firstMock.mockResolvedValue(undefined)
  })

  it("adds a new learning item with inferred kind", async () => {
    const { upsertLearningItem } = await import("../items")
    const item = await upsertLearningItem({
      text: "make sense",
      source: "manual",
    })

    expect(item.kind).toBe("phrase")
    expect(item.status).toBe("learning")
    expect(item.tags).toEqual([])
    expect(item.maturity).toBe("new")
    expect(item.dueAt).toBeInstanceOf(Date)
    expect(addMock).toHaveBeenCalledTimes(1)
  })

  it("merges duplicate items and preserves tags", async () => {
    const { upsertLearningItem } = await import("../items")
    const createdAt = new Date("2026-01-01T00:00:00Z")
    mockRows.push({
      id: "same",
      text: "Make sense",
      normalizedText: "make sense",
      status: "learning",
      kind: "phrase",
      source: "manual",
      tags: ["manual"],
      maturity: "new",
      consecutivePasses: 0,
      reviewCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      createdAt,
      updatedAt: createdAt,
    })
    firstMock.mockResolvedValue(mockRows[0])

    const item = await upsertLearningItem({
      text: " make   sense ",
      source: "selection",
      tags: ["selection"],
      parentId: "parent",
    })

    expect(item.id).toBe("same")
    expect(item.tags).toEqual(["manual", "selection"])
    expect(item.parentId).toBe("parent")
    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it("marks an item mastered after two consecutive passes", async () => {
    const { markLearningItemReviewResult } = await import("../items")
    mockRows.push({
      id: "item-id",
      status: "learning",
      text: "hello",
      normalizedText: "hello",
      kind: "word",
      source: "manual",
      tags: [],
      maturity: "review",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      consecutivePasses: 1,
      reviewCount: 1,
      correctCount: 1,
      incorrectCount: 0,
      updatedAt: new Date(),
    })

    const item = await markLearningItemReviewResult("item-id", true)

    expect(item?.status).toBe("mastered")
    expect(item?.consecutivePasses).toBe(2)
    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it("resets consecutive passes on failure", async () => {
    const { markLearningItemReviewResult } = await import("../items")
    mockRows.push({
      id: "item-id",
      status: "learning",
      text: "hello",
      normalizedText: "hello",
      kind: "word",
      source: "manual",
      tags: [],
      maturity: "review",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      consecutivePasses: 1,
      reviewCount: 1,
      correctCount: 1,
      incorrectCount: 0,
      updatedAt: new Date(),
    })

    const item = await markLearningItemReviewResult("item-id", false)

    expect(item?.status).toBe("learning")
    expect(item?.consecutivePasses).toBe(0)
    expect(item?.incorrectCount).toBe(1)
  })
})
