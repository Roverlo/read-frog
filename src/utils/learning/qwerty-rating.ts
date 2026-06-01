import type { LearningReviewRating } from "@/types/learning"
import type { QwertyTypingResult } from "./qwerty-dicts"

export function getTypingRating(result: QwertyTypingResult): LearningReviewRating {
  if (result.correct) {
    return "good"
  }
  if (result.accuracy >= 80) {
    return "hard"
  }
  return "again"
}
