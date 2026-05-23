import { Entity } from "dexie"
import type { ReviewQuestion } from "@/types/learning"

export default class ReviewSession extends Entity {
  id!: string
  createdAt!: Date
  updatedAt!: Date
  itemIds!: string[]
  title!: string
  material!: string
  materialZh?: string
  questions!: ReviewQuestion[]
  answers!: Array<{
    questionId: string
    selectedAnswer: string
    correct: boolean
  }>
  passed!: boolean
}
