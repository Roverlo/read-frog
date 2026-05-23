import type { ReviewQuestion } from "@/types/learning"
import { Entity } from "dexie"

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
