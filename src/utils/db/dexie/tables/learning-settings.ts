import type { LearningReviewMode } from "@/types/learning"
import { Entity } from "dexie"

export default class LearningSettings extends Entity {
  id!: string
  desiredRetention!: number
  reviewMode!: LearningReviewMode
  includeMasteredInReview!: boolean
  selectionSaveEnabled!: boolean
  updatedAt!: Date
}
