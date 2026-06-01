import { beforeEach, describe, expect, it, vi } from "vitest"

const getLearningBridgeConfigMock = vi.fn()
const getLearningQwertyDictionariesMock = vi.fn()
const getLearningQwertyDictionaryChapterMock = vi.fn()

vi.mock("@/utils/learning-bridge/storage", () => ({
  getLearningBridgeConfig: getLearningBridgeConfigMock,
}))

vi.mock("@/utils/learning-bridge/daemon-client", () => ({
  getLearningQwertyDictionaries: getLearningQwertyDictionariesMock,
  getLearningQwertyDictionaryChapter: getLearningQwertyDictionaryChapterMock,
}))

describe("qwerty-dicts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLearningBridgeConfigMock.mockResolvedValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:7457",
    })
  })

  it("normalizes qwerty dictionary records", async () => {
    const { normalizeQwertyWords } = await import("../qwerty-dicts")

    expect(normalizeQwertyWords([
      { name: " cancel ", trans: ["取消"], usphone: "'kænsl" },
      { name: "skip", trans: null },
      { name: "" },
      null,
    ])).toEqual([
      { index: 0, name: "cancel", trans: ["取消"], usphone: "'kænsl", ukphone: undefined, notation: undefined },
      { index: 1, name: "skip", trans: [], usphone: undefined, ukphone: undefined, notation: undefined },
    ])
  })

  it("scores typing input with mistakes and accuracy", async () => {
    const { scoreTypingInput } = await import("../qwerty-dicts")

    expect(scoreTypingInput("Cancel", "cancel", { ignoreCase: true })).toMatchObject({
      correct: true,
      accuracy: 100,
    })

    const result = scoreTypingInput("cancel", "cansel")
    expect(result.correct).toBe(false)
    expect(result.mistakes).toEqual([
      { expected: "c", actual: "s", index: 3 },
    ])
    expect(result.accuracy).toBe(83)
  })

  it("loads qwerty dictionary resources from the learning daemon", async () => {
    getLearningQwertyDictionariesMock.mockResolvedValue({
      ok: true,
      dictionaries: [{
        id: "cet4",
        name: "CET-4",
        description: "College English Test Band 4 core vocabulary",
        category: "Chinese exams",
        tags: ["CET-4"],
        length: 2607,
        chapterLength: 20,
        chapterCount: 131,
        language: "en",
      }],
    })

    const { loadQwertyDictionaryResources } = await import("../qwerty-dicts")

    await expect(loadQwertyDictionaryResources()).resolves.toEqual([expect.objectContaining({
      id: "cet4",
      chapterCount: 131,
    })])
    expect(getLearningQwertyDictionariesMock).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:7457",
      token: undefined,
    })
  })

  it("loads a qwerty chapter from the learning daemon", async () => {
    getLearningQwertyDictionaryChapterMock.mockResolvedValue({
      ok: true,
      dictionary: {
        id: "cet4",
        name: "CET-4",
        description: "College English Test Band 4 core vocabulary",
        category: "Chinese exams",
        tags: ["CET-4"],
        length: 2607,
        chapterLength: 20,
        chapterCount: 131,
        language: "en",
      },
      chapterIndex: 0,
      words: [{ index: 0, name: "cancel", trans: ["cancel"] }],
    })

    const { loadQwertyChapterWords } = await import("../qwerty-dicts")

    await expect(loadQwertyChapterWords({ id: "cet4" }, 0)).resolves.toEqual([
      { index: 0, name: "cancel", trans: ["cancel"] },
    ])
    expect(getLearningQwertyDictionaryChapterMock).toHaveBeenCalledWith("cet4", 0, {
      baseUrl: "http://127.0.0.1:7457",
      token: undefined,
    })
  })
})
