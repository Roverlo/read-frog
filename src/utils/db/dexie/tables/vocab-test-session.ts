import { Entity } from "dexie"
import type { VocabQuestion } from "@/types/learning"

export default class VocabTestSession extends Entity {
  id!: string
  createdAt!: Date
  updatedAt!: Date
  totalCount!: number
  correctCount!: number
  estimatedVocabulary!: number
  questions!: VocabQuestion[]
  answers!: Array<{
    questionId: string
    selectedAnswer: string
    correct: boolean
  }>
}
