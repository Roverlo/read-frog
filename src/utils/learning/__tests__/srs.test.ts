import { describe, expect, it } from "vitest"
import { createInitialSrsCard, getLearningMaturity, isSrsMastered } from "../srs"

describe("learning srs", () => {
  it("creates a serializable initial FSRS card", () => {
    const card = createInitialSrsCard(new Date("2026-01-01T00:00:00Z"))

    expect(card.due).toBe("2026-01-01T00:00:00.000Z")
    expect(card.reps).toBe(0)
    expect(getLearningMaturity(card)).toBe("new")
  })

  it("treats long scheduled intervals as mastered", () => {
    const card = {
      ...createInitialSrsCard(new Date("2026-01-01T00:00:00Z")),
      reps: 5,
      scheduled_days: 21,
      state: 2,
    }

    expect(getLearningMaturity(card)).toBe("mature")
    expect(isSrsMastered(card, 0)).toBe(true)
  })
})
