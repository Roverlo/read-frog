import type { LearningExplanation, LearningItem, LearningItemKind, LearningItemStatus, LearningReviewRating } from "@/types/learning"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { db } from "@/utils/db/dexie/db"
import { normalizeLearningText } from "./normalize"
import { applySrsReview, createInitialSrsCard, getLearningMaturity, isSrsMastered } from "./srs"

export { normalizeLearningText } from "./normalize"

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
  parentId?: string
  tags?: string[]
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
    const srsCard = existing.srsCard ?? createInitialSrsCard(existing.createdAt)
    const status = input.status ?? existing.status
    const next: LearningItem = {
      ...existing,
      kind: input.kind ?? existing.kind,
      status,
      source: input.source,
      sourceUrl: input.sourceUrl ?? existing.sourceUrl,
      sourceTitle: input.sourceTitle ?? existing.sourceTitle,
      context: input.context ?? existing.context,
      explanation: input.explanation ?? existing.explanation,
      parentId: input.parentId ?? existing.parentId,
      tags: [...new Set([...(existing.tags ?? []), ...(input.tags ?? [])])],
      srsCard,
      dueAt: existing.dueAt ?? existing.nextReviewAt ?? new Date(),
      maturity: getLearningMaturity(srsCard),
      updatedAt: now,
      masteredAt: status === "mastered" ? (existing.masteredAt ?? now) : existing.masteredAt,
    }
    await db.learningItems.put(next)
    return next
  }

  const srsCard = createInitialSrsCard(now)
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
    parentId: input.parentId,
    tags: input.tags ?? [],
    srsCard,
    dueAt: input.status === "mastered" ? undefined : now,
    lastReviewAt: undefined,
    lastRating: undefined,
    maturity: input.status === "mastered" ? "mature" : "new",
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
  return await markLearningItemReviewRating(itemId, passed ? "good" : "again")
}

export async function markLearningItemReviewRating(
  itemId: string,
  rating: LearningReviewRating,
  options: {
    sessionId?: string
    reviewedAt?: Date
    desiredRetention?: number
  } = {},
) {
  const item = await db.learningItems.get(itemId)
  if (!item) {
    return null
  }

  const now = options.reviewedAt ?? new Date()
  const passed = rating === "good" || rating === "easy"
  const { before, after, dueAt, maturity } = applySrsReview({
    item,
    rating,
    reviewedAt: now,
    desiredRetention: options.desiredRetention,
  })
  const consecutivePasses = passed ? item.consecutivePasses + 1 : 0
  const status: LearningItemStatus = isSrsMastered(after, consecutivePasses) ? "mastered" : item.status === "archived" ? "archived" : "learning"
  const next: LearningItem = {
    ...item,
    status,
    consecutivePasses,
    reviewCount: item.reviewCount + 1,
    correctCount: item.correctCount + (passed ? 1 : 0),
    incorrectCount: item.incorrectCount + (passed ? 0 : 1),
    srsCard: after,
    dueAt: status === "mastered" ? undefined : dueAt,
    lastReviewAt: now,
    lastRating: rating,
    maturity,
    updatedAt: now,
    masteredAt: status === "mastered" ? (item.masteredAt ?? now) : item.masteredAt,
    nextReviewAt: status === "mastered" ? undefined : dueAt,
  }

  await db.transaction("rw", db.learningItems, db.learningReviewLogs, async () => {
    await db.learningItems.put(next)
    await db.learningReviewLogs.add({
      id: getRandomUUID(),
      itemId,
      sessionId: options.sessionId,
      rating,
      correct: passed,
      reviewedAt: now,
      srsBefore: before,
      srsAfter: after,
      createdAt: now,
      updatedAt: now,
    })
  })
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
