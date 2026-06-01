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

  it("skips mastered projection entries only when they are confident and not due", async () => {
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
          normalizedText: "process",
          kind: "word",
          status: "mature",
          confidence: 0.91,
          definition: "daemon process",
          dueAt: "2000-01-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          normalizedText: "structure",
          kind: "word",
          status: "mature",
          confidence: 0.72,
          definition: "daemon structure",
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

    const summary = await buildLearningTranslationSummary("The workflow ability process structure has a constraint.", 6)

    expect(summary).not.toContain("workflow")
    expect(summary).not.toContain("ability")
    expect(summary).toContain("process: daemon process")
    expect(summary).toContain("structure: daemon structure")
    expect(summary).toContain("constraint: daemon constraint")
  })

  it("returns empty text when every known term is confidently mastered or archived in daemon projection", async () => {
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

  it("uses daemon projection entries and skips confidently mastered terms", async () => {
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
      terms: expect.arrayContaining(["the workflow", "workflow", "constraint"]),
    })
  })

  it("prefers daemon phrase projection entries before individual word fallbacks", async () => {
    sendMessageMock.mockResolvedValue({
      status: "ok",
      projectionVersion: "projection-1",
      entries: [
        {
          normalizedText: "repeatable workflow",
          kind: "phrase",
          status: "learning",
          confidence: 0.42,
          definition: "daemon phrase",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
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

    const summary = await buildLearningTranslationSummary("A repeatable workflow improves teams.", 6)

    expect(summary).toContain("repeatable workflow: daemon phrase")
    expect(summary).not.toContain("workflow: daemon workflow")
    expect(sendMessageMock).toHaveBeenCalledWith("getLearningProjectionTerms", {
      terms: expect.arrayContaining(["repeatable workflow", "workflow"]),
    })
  })

  it("lets confidently mastered phrases suppress their covered word fallbacks", async () => {
    sendMessageMock.mockResolvedValue({
      status: "ok",
      projectionVersion: "projection-1",
      entries: [
        {
          normalizedText: "repeatable workflow",
          kind: "phrase",
          status: "mature",
          confidence: 0.96,
          definition: "daemon phrase",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
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

    const summary = await buildLearningTranslationSummary("A repeatable workflow improves teams.", 6)

    expect(summary).not.toContain("repeatable workflow")
    expect(summary).not.toContain("workflow: daemon workflow")
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
