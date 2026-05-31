import type { QwertyTypingMistakeLog } from "@/types/learning"
import { Entity } from "dexie"

export default class QwertyTypingRecord extends Entity {
  id!: string
  itemId!: string
  dictId!: string
  dictName!: string
  chapterIndex!: number
  wordIndex!: number
  word!: string
  input!: string
  correct!: boolean
  accuracy!: number
  durationMs!: number
  mistakes!: QwertyTypingMistakeLog[]
  createdAt!: Date
  updatedAt!: Date
}
