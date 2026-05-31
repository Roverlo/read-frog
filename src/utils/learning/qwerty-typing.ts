import type { LearningReviewRating, QwertyTypingRecord } from "@/types/learning"
import type { QwertyDictResource, QwertyTypingResult, QwertyWordWithIndex } from "./qwerty-dicts"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { db } from "@/utils/db/dexie/db"
import { markLearningItemReviewRating, upsertLearningItem } from "./items"
import { getWordMeaning } from "./qwerty-dicts"

export function getTypingRating(result: QwertyTypingResult): LearningReviewRating {
  if (result.correct) {
    return "good"
  }
  if (result.accuracy >= 80) {
    return "hard"
  }
  return "again"
}

export async function saveQwertyTypingResult(input: {
  dict: QwertyDictResource
  word: QwertyWordWithIndex
  typedText: string
  result: QwertyTypingResult
  chapterIndex: number
  durationMs: number
}) {
  const item = await upsertLearningItem({
    text: input.word.name,
    kind: "word",
    status: "learning",
    source: "review",
    context: `${input.dict.name} 第 ${input.chapterIndex + 1} 章键盘练习`,
    explanation: {
      meaningZh: getWordMeaning(input.word),
      examples: [],
      notes: [
        input.word.usphone ? `US ${input.word.usphone}` : "",
        input.word.ukphone ? `UK ${input.word.ukphone}` : "",
      ].filter(Boolean).join(" · "),
    },
    tags: [
      "source:qwerty-learner",
      `dict:${input.dict.id}`,
      input.dict.category,
      ...input.dict.tags,
    ],
  })

  const now = new Date()
  const record: QwertyTypingRecord = {
    id: getRandomUUID(),
    itemId: item.id,
    dictId: input.dict.id,
    dictName: input.dict.name,
    chapterIndex: input.chapterIndex,
    wordIndex: input.word.index,
    word: input.word.name,
    input: input.typedText,
    correct: input.result.correct,
    accuracy: input.result.accuracy,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    mistakes: input.result.mistakes,
    createdAt: now,
    updatedAt: now,
  }

  await db.qwertyTypingRecords.add(record)
  await markLearningItemReviewRating(item.id, getTypingRating(input.result), { reviewedAt: now })

  return { item, record }
}

export async function getQwertyTypingStats() {
  const records = await db.qwertyTypingRecords.toArray()
  const total = records.length
  const correct = records.filter(record => record.correct).length
  const averageAccuracy = total === 0
    ? 0
    : Math.round(records.reduce((sum, record) => sum + record.accuracy, 0) / total)
  const averageDurationMs = total === 0
    ? 0
    : Math.round(records.reduce((sum, record) => sum + record.durationMs, 0) / total)

  return {
    total,
    correct,
    wrong: total - correct,
    averageAccuracy,
    averageDurationMs,
  }
}
