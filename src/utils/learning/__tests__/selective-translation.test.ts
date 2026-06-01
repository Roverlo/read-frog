import { beforeEach, describe, expect, it, vi } from "vitest"

interface MockLearningRow {
  id: string
  kind: string
  normalizedText: string
  status: string
  explanation?: {
    meaningZh?: string
  }
}

const mockRows: MockLearningRow[] = []
const equalsMock = vi.fn(() => ({
  toArray: vi.fn(async () => mockRows),
}))
const whereMock = vi.fn(() => ({
  equals: equalsMock,
}))
const sendMessageMock = vi.fn()

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    learningItems: {
      where: whereMock,
    },
  },
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

describe("selective learning translation", () => {
  beforeEach(() => {
    mockRows.length = 0
    vi.clearAllMocks()
    sendMessageMock.mockRejectedValue(new Error("bridge unavailable"))
  })

  it("summarizes dictionary words when learning mode has no mastered match", async () => {
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("This workflow can improve your ability.", 4)

    expect(summary).toContain("workflow: 工作流程")
    expect(summary).toContain("improve: 改善；提高")
    expect(summary).toContain("ability: 能力；才能")
  })

  it("skips mastered words and uses learning explanations for learning words", async () => {
    mockRows.push(
      { id: "1", kind: "word", normalizedText: "workflow", status: "mastered" },
      {
        id: "2",
        kind: "word",
        normalizedText: "constraint",
        status: "learning",
        explanation: { meaningZh: "约束；限制条件" },
      },
    )
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("The workflow has a constraint.", 6)

    expect(summary).not.toContain("workflow")
    expect(summary).toContain("constraint: 约束；限制条件")
  })

  it("returns empty text when every known term is mastered", async () => {
    mockRows.push(
      { id: "1", kind: "word", normalizedText: "workflow", status: "mastered" },
      { id: "2", kind: "word", normalizedText: "ability", status: "mastered" },
    )
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("workflow ability", 6)

    expect(summary).toBe("")
  })

  it("uses daemon projection entries and skips mature terms", async () => {
    sendMessageMock.mockResolvedValue({
      status: "ok",
      projectionVersion: "projection-1",
      entries: [
        {
          normalizedText: "workflow",
          kind: "word",
          status: "mature",
          confidence: 0.98,
          definition: "daemon workflow",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          normalizedText: "constraint",
          kind: "word",
          status: "review",
          confidence: 0.62,
          definition: "daemon constraint",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    })
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("The workflow has a constraint.", 6)

    expect(summary).not.toContain("workflow")
    expect(summary).toContain("constraint: daemon constraint")
    expect(sendMessageMock).toHaveBeenCalledWith("getLearningProjectionTerms", {
      terms: expect.arrayContaining(["workflow", "constraint"]),
    })
  })

  it("uses cached daemon projection entries while the daemon is offline", async () => {
    sendMessageMock.mockResolvedValue({
      status: "cached",
      projectionVersion: "projection-cached",
      entries: [
        {
          normalizedText: "workflow",
          kind: "word",
          status: "mature",
          confidence: 0.98,
          definition: "cached workflow",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          normalizedText: "constraint",
          kind: "word",
          status: "review",
          confidence: 0.62,
          definition: "cached constraint",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      error: "daemon offline",
    })
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("The workflow has a constraint.", 6)

    expect(summary).not.toContain("workflow")
    expect(summary).toContain("constraint: cached constraint")
  })

  it("lets daemon projection override stale local mastered state", async () => {
    mockRows.push({ id: "1", kind: "word", normalizedText: "workflow", status: "mastered" })
    sendMessageMock.mockResolvedValue({
      status: "ok",
      projectionVersion: "projection-1",
      entries: [
        {
          normalizedText: "workflow",
          kind: "word",
          status: "review",
          confidence: 0.62,
          definition: "daemon workflow",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    })
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("workflow", 6)

    expect(summary).toBe("workflow: daemon workflow")
  })
})
