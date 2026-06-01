import type { LearningExplanation, LearningItemKind, LearningItemStatus, LearningMaturity, LearningReviewRating, LearningSrsCard } from "@/types/learning"
import { Entity } from "dexie"

export default class LearningItem extends Entity {
  id!: string
  kind!: LearningItemKind
  text!: string
  normalizedText!: string
  status!: LearningItemStatus
  source!: "vocab-test" | "selection" | "manual" | "review"
  sourceUrl?: string
  sourceTitle?: string
  context?: string
  explanation?: LearningExplanation
  parentId?: string
  tags!: string[]
  srsCard?: LearningSrsCard
  dueAt?: Date
  lastReviewAt?: Date
  lastRating?: LearningReviewRating
  maturity!: LearningMaturity
  consecutivePasses!: number
  reviewCount!: number
  correctCount!: number
  incorrectCount!: number
  createdAt!: Date
  updatedAt!: Date
  masteredAt?: Date
  nextReviewAt?: Date
}
