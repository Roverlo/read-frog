import { describe, expect, it } from "vitest"

describe("qwerty-typing", () => {
  it("maps typing accuracy to review ratings", async () => {
    const { getTypingRating } = await import("../qwerty-typing")

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
})
