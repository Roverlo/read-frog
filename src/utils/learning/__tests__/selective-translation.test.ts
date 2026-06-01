import { beforeEach, describe, expect, it, vi } from "vitest"

const sendMessageMock = vi.fn()

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

describe("selective learning translation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendMessageMock.mockRejectedValue(new Error("bridge unavailable"))
  })

  it("summarizes dictionary words when no daemon projection is available", async () => {
    const { buildLearningTranslationSummary } = await import("../selective-translation")

    const summary = await buildLearningTranslationSummary("This workflow can improve your ability.", 4)

    expect(summary).toContain("workflow: 工作流程")
    expect(summary).toContain("improve: 改善；提高")
    expect(summary).toContain("ability: 能力；才能")
  })

  it("skips mature and archived daemon projection entries", async () => {
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
          normalizedText: "ability",
          kind: "word",
          status: "archived",
          confidence: 1,
          definition: "daemon ability",
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

    const summary = await buildLearningTranslationSummary("The workflow ability has a constraint.", 6)

    expect(summary).not.toContain("workflow")
    expect(summary).not.toContain("ability")
    expect(summary).toContain("constraint: daemon constraint")
  })

  it("returns empty text when every known term is mature or archived in daemon projection", async () => {
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
          normalizedText: "ability",
          kind: "word",
          status: "archived",
          confidence: 1,
          definition: "daemon ability",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    })
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

  it("uses daemon review entries without consulting the local learning database", async () => {
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
