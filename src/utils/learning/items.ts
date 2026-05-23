import type { LearningExplanation, LearningItem, LearningItemKind, LearningItemStatus } from "@/types/learning"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { db } from "@/utils/db/dexie/db"

export function normalizeLearningText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase()
}

export function inferLearningItemKind(text: string): LearningItemKind {
  const trimmed = text.trim()
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  if (wordCount <= 1) {
    return "word"
  }
  if (wordCount <= 4 && !/[.!?。！？]/.test(trimmed)) {
    return "phrase"
  }
  if (wordCount <= 24) {
    return "sentence"
  }
  return "paragraph"
}

export async function upsertLearningItem(input: {
  text: string
  kind?: LearningItemKind
  status?: LearningItemStatus
  source: LearningItem["source"]
  sourceUrl?: string
  sourceTitle?: string
  context?: string
  explanation?: LearningExplanation
}) {
  const normalizedText = normalizeLearningText(input.text)
  if (!normalizedText) {
    throw new Error("Learning item text is empty")
  }

  const now = new Date()
  const existing = await db.learningItems
    .where("normalizedText")
    .equals(normalizedText)
    .first()

  if (existing) {
    const next: LearningItem = {
      ...existing,
      kind: input.kind ?? existing.kind,
      status: input.status ?? existing.status,
      source: input.source,
      sourceUrl: input.sourceUrl ?? existing.sourceUrl,
      sourceTitle: input.sourceTitle ?? existing.sourceTitle,
      context: input.context ?? existing.context,
      explanation: input.explanation ?? existing.explanation,
      updatedAt: now,
      masteredAt: input.status === "mastered" ? (existing.masteredAt ?? now) : existing.masteredAt,
    }
    await db.learningItems.put(next)
    return next
  }

  const item: LearningItem = {
    id: getRandomUUID(),
    kind: input.kind ?? inferLearningItemKind(input.text),
    text: input.text.trim(),
    normalizedText,
    status: input.status ?? "learning",
    source: input.source,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    context: input.context,
    explanation: input.explanation,
    consecutivePasses: input.status === "mastered" ? 2 : 0,
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    createdAt: now,
    updatedAt: now,
    masteredAt: input.status === "mastered" ? now : undefined,
    nextReviewAt: input.status === "mastered" ? undefined : now,
  }
  await db.learningItems.add(item)
  return item
}

export async function markLearningItemReviewResult(itemId: string, passed: boolean) {
  const item = await db.learningItems.get(itemId)
  if (!item) {
    return null
  }

  const now = new Date()
  const consecutivePasses = passed ? item.consecutivePasses + 1 : 0
  const status: LearningItemStatus = consecutivePasses >= 2 ? "mastered" : item.status === "archived" ? "archived" : "learning"
  const next: LearningItem = {
    ...item,
    status,
    consecutivePasses,
    reviewCount: item.reviewCount + 1,
    correctCount: item.correctCount + (passed ? 1 : 0),
    incorrectCount: item.incorrectCount + (passed ? 0 : 1),
    updatedAt: now,
    masteredAt: status === "mastered" ? (item.masteredAt ?? now) : item.masteredAt,
    nextReviewAt: status === "mastered" ? undefined : new Date(now.getTime() + 24 * 60 * 60 * 1000),
  }

  await db.learningItems.put(next)
  return next
}

export async function getLearningStats() {
  const [learning, mastered, archived, total] = await Promise.all([
    db.learningItems.where("status").equals("learning").count(),
    db.learningItems.where("status").equals("mastered").count(),
    db.learningItems.where("status").equals("archived").count(),
    db.learningItems.count(),
  ])

  return { learning, mastered, archived, total }
}
