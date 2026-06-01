import { beforeEach, describe, expect, it, vi } from "vitest"

const postLearningQwertyWordRecordMock = vi.fn()
const getLearningBridgeConfigMock = vi.fn()
const addQwertyRecordMock = vi.fn()
const upsertLearningItemMock = vi.fn()
const markLearningItemReviewRatingMock = vi.fn()

vi.mock("@/utils/learning-bridge/daemon-client", () => ({
  postLearningQwertyWordRecord: postLearningQwertyWordRecordMock,
}))

vi.mock("@/utils/learning-bridge/storage", () => ({
  getLearningBridgeConfig: getLearningBridgeConfigMock,
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: () => "record-1",
}))

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    qwertyTypingRecords: {
      add: addQwertyRecordMock,
      toArray: vi.fn(async () => []),
    },
  },
}))

vi.mock("../items", () => ({
  upsertLearningItem: upsertLearningItemMock,
  markLearningItemReviewRating: markLearningItemReviewRatingMock,
}))

describe("qwerty-typing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLearningBridgeConfigMock.mockResolvedValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:7457",
    })
    upsertLearningItemMock.mockResolvedValue({
      id: "item-1",
    })
    markLearningItemReviewRatingMock.mockResolvedValue(undefined)
    addQwertyRecordMock.mockResolvedValue("record-1")
    postLearningQwertyWordRecordMock.mockResolvedValue({
      ok: true,
    })
  })

  it("maps typing accuracy to review ratings", async () => {
    const { getTypingRating } = await import("../qwerty-rating")

    expect(getTypingRating({
      correct: true,
      normalizedExpected: "cancel",
      normalizedInput: "cancel",
      mistakes: [],
      accuracy: 100,
    })).toBe("good")

    expect(getTypingRating({
      correct: false,
      normalizedExpected: "cancel",
      normalizedInput: "cansel",
      mistakes: [{ expected: "c", actual: "s", index: 3 }],
      accuracy: 83,
    })).toBe("hard")

    expect(getTypingRating({
      correct: false,
      normalizedExpected: "cancel",
      normalizedInput: "cn",
      mistakes: [],
      accuracy: 40,
    })).toBe("again")
  })

  it("saves local typing records and mirrors them to the learning daemon", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"))
    try {
      const { saveQwertyTypingResult } = await import("../qwerty-typing")

      await saveQwertyTypingResult({
        dict: {
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
        word: {
          index: 0,
          name: "cancel",
          trans: ["cancel"],
        },
        typedText: "cancel",
        result: {
          correct: true,
          normalizedExpected: "cancel",
          normalizedInput: "cancel",
          mistakes: [],
          accuracy: 100,
        },
        chapterIndex: 0,
        durationMs: 1234,
      })

      expect(addQwertyRecordMock).toHaveBeenCalledWith(expect.objectContaining({
        id: "record-1",
        itemId: "item-1",
        word: "cancel",
        accuracy: 100,
      }))
      await vi.waitFor(() => {
        expect(postLearningQwertyWordRecordMock).toHaveBeenCalledWith(expect.objectContaining({
          id: "record-1",
          word: "cancel",
          input: "cancel",
          correct: true,
          accuracy: 1,
          dictId: "cet4",
          chapterIndex: 0,
          wordIndex: 0,
          createdAt: "2026-06-01T00:00:00.000Z",
        }), {
          baseUrl: "http://127.0.0.1:7457",
          token: undefined,
        })
      })
    }
    finally {
      vi.useRealTimers()
    }
  })
})
