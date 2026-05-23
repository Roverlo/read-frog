import { beforeEach, describe, expect, it, vi } from "vitest"

interface MockLearningRow {
  id: string
  kind?: string
  status: string
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
const firstMock = vi.fn(async () => mockRows[0])
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
    expect(addMock).toHaveBeenCalledTimes(1)
  })

  it("marks an item mastered after two consecutive passes", async () => {
    const { markLearningItemReviewResult } = await import("../items")
    mockRows.push({
      id: "item-id",
      status: "learning",
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
