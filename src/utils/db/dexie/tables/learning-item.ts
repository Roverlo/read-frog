import { Entity } from "dexie"
import type { LearningExplanation, LearningItemKind, LearningItemStatus } from "@/types/learning"

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
  consecutivePasses!: number
  reviewCount!: number
  correctCount!: number
  incorrectCount!: number
  createdAt!: Date
  updatedAt!: Date
  masteredAt?: Date
  nextReviewAt?: Date
}
