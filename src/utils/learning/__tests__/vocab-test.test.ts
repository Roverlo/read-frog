import { describe, expect, it, vi } from "vitest"

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: vi.fn(() => "question-id"),
}))

describe("vocab-test", () => {
  it("creates multiple choice questions with the answer included", async () => {
    const { createVocabQuestions } = await import("../vocab-test")
    const questions = createVocabQuestions(6)

    expect(questions).toHaveLength(6)
    for (const question of questions) {
      expect(question.choices).toContain(question.answer)
      expect(question.choices).toHaveLength(4)
    }
  })

  it("estimates a larger vocabulary for more correct weighted answers", async () => {
    const { createVocabQuestions, estimateVocabularySize } = await import("../vocab-test")
    const questions = createVocabQuestions(10)
    const low = estimateVocabularySize(questions, new Set())
    const high = estimateVocabularySize(questions, new Set(questions.map(question => question.id)))

    expect(high).toBeGreaterThan(low)
    expect(low).toBeGreaterThanOrEqual(800)
  })
})
