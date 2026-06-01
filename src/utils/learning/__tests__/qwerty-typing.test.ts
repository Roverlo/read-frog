import { beforeEach, describe, expect, it, vi } from "vitest"

const upsertLearningItemMock = vi.fn()
const markLearningItemReviewRatingMock = vi.fn()
const addQwertyRecordMock = vi.fn()
const sendMessageMock = vi.fn()

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
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
    sendMessageMock.mockResolvedValue({
      status: "synced",
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

  it("saves typing records through the learning daemon bridge without local Dexie writes", async () => {
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

      expect(sendMessageMock).toHaveBeenCalledWith("syncLearningQwertyWordRecord", expect.objectContaining({
        id: "record-1",
        word: "cancel",
        input: "cancel",
        correct: true,
        accuracy: 1,
        dictId: "cet4",
        chapterIndex: 0,
        wordIndex: 0,
        definition: "cancel",
        createdAt: "2026-06-01T00:00:00.000Z",
      }))
      expect(addQwertyRecordMock).not.toHaveBeenCalled()
      expect(upsertLearningItemMock).not.toHaveBeenCalled()
      expect(markLearningItemReviewRatingMock).not.toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("reads qwerty typing stats from daemon workspace state", async () => {
    sendMessageMock.mockResolvedValue({
      status: "ok",
      state: {
        stats: {
          qwertyRecordCount: 3,
          correctQwertyRecordCount: 2,
          averageAccuracy: 0.9,
          averageDurationMs: 2000,
        },
        qwertyWordRecords: [],
      },
    })
    const { getQwertyTypingStats } = await import("../qwerty-typing")

    await expect(getQwertyTypingStats()).resolves.toEqual({
      total: 3,
      correct: 2,
      wrong: 1,
      averageAccuracy: 90,
      averageDurationMs: 2000,
    })
    expect(sendMessageMock).toHaveBeenCalledWith("getLearningWorkspaceState", undefined)
  })
})
