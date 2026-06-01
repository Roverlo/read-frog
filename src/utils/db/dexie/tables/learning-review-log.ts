import type { LearningReviewRating, LearningSrsCard } from "@/types/learning"
import { Entity } from "dexie"

export default class LearningReviewLog extends Entity {
  id!: string
  itemId!: string
  sessionId?: string
  rating!: LearningReviewRating
  correct!: boolean
  reviewedAt!: Date
  srsBefore?: LearningSrsCard
  srsAfter?: LearningSrsCard
  createdAt!: Date
  updatedAt!: Date
}
