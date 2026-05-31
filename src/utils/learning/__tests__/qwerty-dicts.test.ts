import { describe, expect, it, vi } from "vitest"

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://read-frog/${path}`,
    },
  },
}))

describe("qwerty-dicts", () => {
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

  it("resolves extension URLs for bundled qwerty dictionaries", async () => {
    const { getQwertyDictUrl } = await import("../qwerty-dicts")

    expect(getQwertyDictUrl("/dicts/qwerty/CET4_T.json")).toMatch(/^chrome-extension:\/\/.+\/dicts\/qwerty\/CET4_T\.json$/)
    expect(getQwertyDictUrl("https://example.com/dict.json")).toBe("https://example.com/dict.json")
  })
})
