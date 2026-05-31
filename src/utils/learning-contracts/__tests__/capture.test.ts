import { describe, expect, it } from "vitest"
import { createLearningCaptureSelectionRequest } from "../capture"

describe("learning capture contracts", () => {
  it("fills stable id and createdAt for selection captures", () => {
    const request = createLearningCaptureSelectionRequest({
      text: "workflow",
      context: "A workflow is a repeatable process.",
      sourceUrl: "https://example.com/article",
      extractedItems: [{
        text: "repeatable",
        tags: ["source:selection"],
      }],
    }, {
      id: "capture-1",
      now: "2026-06-01T00:00:00.000Z",
    })

    expect(request).toEqual({
      id: "capture-1",
      text: "workflow",
      context: "A workflow is a repeatable process.",
      sourceUrl: "https://example.com/article",
      createdAt: "2026-06-01T00:00:00.000Z",
      extractedItems: [{
        text: "repeatable",
        kind: "word",
        tags: ["source:selection"],
      }],
    })
  })

  it("rejects empty capture text", () => {
    expect(() => createLearningCaptureSelectionRequest({
      text: "   ",
    }, {
      id: "capture-1",
      now: "2026-06-01T00:00:00.000Z",
    })).toThrow()
  })
})
