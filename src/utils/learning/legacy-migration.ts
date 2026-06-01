import type {
  LearningItem,
  LearningMaturity,
  LearningReviewLog,
  QwertyTypingRecord,
  ReviewSession,
} from "@/types/learning"
import type {
  LearningCaptureSelectionRequest,
  LearningDaemonPortableState,
  LearningProjectionStatus,
  LearningQwertyWordRecordRequest,
  MasteryProjectionEntry,
} from "@/utils/learning-contracts"
import { db } from "@/utils/db/dexie/db"
import { normalizeLearningText } from "./normalize"

function toIso(value: Date | string | undefined) {
  if (!value) {
    return undefined
  }
  return value instanceof Date ? value.toISOString() : value
}

function clampConfidence(value: number) {
  return Math.max(0.05, Math.min(0.99, value))
}

function getProjectionStatus(item: LearningItem): LearningProjectionStatus {
  if (item.status === "archived") {
    return "archived"
  }
  if (item.status === "mastered" || item.maturity === "mature") {
    return "mature"
  }
  if (item.maturity === "review") {
    return "review"
  }
  return "learning"
}

function getMaturityBaseConfidence(maturity: LearningMaturity) {
  return {
    new: 0.25,
    learning: 0.45,
    review: 0.7,
    mature: 0.92,
  }[maturity]
}

function getProjectionConfidence(item: LearningItem) {
  const attempts = item.correctCount + item.incorrectCount
  const accuracy = attempts > 0 ? item.correctCount / attempts : 0
  const reviewWeight = Math.min(0.2, item.reviewCount * 0.025)
  const accuracyWeight = attempts > 0 ? (accuracy - 0.5) * 0.35 : 0
  const statusWeight = item.status === "mastered" ? 0.06 : item.status === "archived" ? -0.15 : 0
  return clampConfidence(getMaturityBaseConfidence(item.maturity) + reviewWeight + accuracyWeight + statusWeight)
}

function mapExplanation(item: LearningItem) {
  if (!item.explanation) {
    return undefined
  }
  return {
    meaningZh: item.explanation.meaningZh,
    examples: item.explanation.examples ?? [],
    notes: item.explanation.notes,
  }
}

export function legacyLearningItemToProjectionEntry(item: LearningItem): MasteryProjectionEntry | undefined {
  const normalizedText = normalizeLearningText(item.normalizedText || item.text)
  if (!normalizedText) {
    return undefined
  }
  return {
    normalizedText,
    kind: item.kind,
    status: getProjectionStatus(item),
    confidence: getProjectionConfidence(item),
    dueAt: toIso(item.dueAt ?? item.nextReviewAt),
    definition: item.explanation?.meaningZh,
    updatedAt: toIso(item.updatedAt) ?? new Date().toISOString(),
  }
}

export function legacyLearningItemsToCaptures(items: LearningItem[]): LearningCaptureSelectionRequest[] {
  const childrenByParent = new Map<string, LearningItem[]>()
  for (const item of items) {
    if (!item.parentId) {
      continue
    }
    const children = childrenByParent.get(item.parentId) ?? []
    children.push(item)
    childrenByParent.set(item.parentId, children)
  }

  return items
    .filter(item => item.source === "selection" && !item.parentId)
    .map((item) => {
      const children = childrenByParent.get(item.id) ?? []
      return {
        id: `legacy:item:${item.id}`,
        text: item.text,
        context: item.context,
        sourceUrl: item.sourceUrl,
        sourceTitle: item.sourceTitle,
        explanation: mapExplanation(item),
        extractedItems: children.map(child => ({
          text: child.text,
          kind: child.kind,
          explanation: mapExplanation(child),
          tags: child.tags ?? [],
        })),
        createdAt: toIso(item.createdAt) ?? new Date().toISOString(),
      }
    })
}

function normalizeLegacyAccuracy(accuracy: number) {
  const ratio = accuracy > 1 ? accuracy / 100 : accuracy
  return Math.max(0, Math.min(1, ratio))
}

export function legacyQwertyRecordToDaemonRecord(
  record: QwertyTypingRecord,
  itemById: Map<string, LearningItem> = new Map(),
): LearningQwertyWordRecordRequest {
  return {
    id: `legacy:qwerty:${record.id}`,
    word: record.word,
    input: record.input,
    correct: record.correct,
    accuracy: normalizeLegacyAccuracy(record.accuracy),
    durationMs: Math.max(0, Math.round(record.durationMs)),
    dictId: record.dictId,
    dictName: record.dictName,
    chapterIndex: record.chapterIndex,
    wordIndex: record.wordIndex,
    definition: itemById.get(record.itemId)?.explanation?.meaningZh,
    mistakes: record.mistakes ?? [],
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
  }
}

function serializeLegacyRecord<T extends { createdAt?: Date, updatedAt?: Date }>(record: T) {
  return {
    ...record,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  } as Record<string, unknown>
}

function serializeLegacyReviewLog(record: LearningReviewLog) {
  return {
    ...serializeLegacyRecord(record),
    reviewedAt: toIso(record.reviewedAt),
  }
}

export function buildLegacyLearningDaemonImportState(input: {
  items: LearningItem[]
  qwertyTypingRecords: QwertyTypingRecord[]
  reviewLogs: LearningReviewLog[]
  reviewSessions: ReviewSession[]
}): LearningDaemonPortableState {
  const itemById = new Map(input.items.map(item => [item.id, item]))
  return {
    captures: legacyLearningItemsToCaptures(input.items),
    qwertyWordRecords: input.qwertyTypingRecords.map(record =>
      legacyQwertyRecordToDaemonRecord(record, itemById),
    ),
    qwertyChapterRecords: [],
    entries: input.items
      .map(legacyLearningItemToProjectionEntry)
      .filter((entry): entry is MasteryProjectionEntry => Boolean(entry)),
    legacyReviewLogs: input.reviewLogs.map(serializeLegacyReviewLog),
    legacyReviewSessions: input.reviewSessions.map(serializeLegacyRecord),
  }
}

export async function exportLegacyLearningDataForDaemon(): Promise<LearningDaemonPortableState> {
  const [items, qwertyTypingRecords, reviewLogs, reviewSessions] = await Promise.all([
    db.learningItems.toArray(),
    db.qwertyTypingRecords.toArray(),
    db.learningReviewLogs.toArray(),
    db.reviewSessions.toArray(),
  ])
  return buildLegacyLearningDaemonImportState({
    items,
    qwertyTypingRecords,
    reviewLogs,
    reviewSessions,
  })
}
