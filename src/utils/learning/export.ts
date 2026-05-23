import type {
  LearningDataExport,
  LearningItem,
  LearningReviewLog,
  LearningSettings,
  ReviewSession,
  SerializedLearningItem,
  SerializedLearningReviewLog,
  SerializedLearningSettings,
  SerializedReviewSession,
  SerializedVocabTestSession,
  VocabTestSession,
} from "@/types/learning"
import { db } from "@/utils/db/dexie/db"

function serializeLearningItem(item: LearningItem): SerializedLearningItem {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    masteredAt: item.masteredAt?.toISOString(),
    nextReviewAt: item.nextReviewAt?.toISOString(),
    dueAt: item.dueAt?.toISOString(),
    lastReviewAt: item.lastReviewAt?.toISOString(),
  }
}

function deserializeLearningItem(item: SerializedLearningItem): LearningItem {
  return {
    ...item,
    tags: item.tags ?? [],
    maturity: item.maturity ?? (item.status === "mastered" ? "mature" : "new"),
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    masteredAt: item.masteredAt ? new Date(item.masteredAt) : undefined,
    nextReviewAt: item.nextReviewAt ? new Date(item.nextReviewAt) : undefined,
    dueAt: item.dueAt ? new Date(item.dueAt) : item.nextReviewAt ? new Date(item.nextReviewAt) : undefined,
    lastReviewAt: item.lastReviewAt ? new Date(item.lastReviewAt) : undefined,
  }
}

function serializeVocabTestSession(session: VocabTestSession): SerializedVocabTestSession {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

function deserializeVocabTestSession(session: SerializedVocabTestSession): VocabTestSession {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  }
}

function serializeReviewSession(session: ReviewSession): SerializedReviewSession {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

function deserializeReviewSession(session: SerializedReviewSession): ReviewSession {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  }
}

function serializeLearningReviewLog(log: LearningReviewLog): SerializedLearningReviewLog {
  return {
    ...log,
    reviewedAt: log.reviewedAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  }
}

function deserializeLearningReviewLog(log: SerializedLearningReviewLog): LearningReviewLog {
  return {
    ...log,
    reviewedAt: new Date(log.reviewedAt),
    createdAt: new Date(log.createdAt),
    updatedAt: new Date(log.updatedAt),
  }
}

function serializeLearningSettings(settings: LearningSettings): SerializedLearningSettings {
  return {
    ...settings,
    updatedAt: settings.updatedAt.toISOString(),
  }
}

function deserializeLearningSettings(settings: SerializedLearningSettings): LearningSettings {
  return {
    ...settings,
    updatedAt: new Date(settings.updatedAt),
  }
}

function newerByUpdatedAt<T extends { updatedAt: Date }>(left: T, right: T) {
  return left.updatedAt.getTime() >= right.updatedAt.getTime() ? left : right
}

export async function exportLearningData(): Promise<LearningDataExport> {
  const [items, vocabTestSessions, reviewSessions, reviewLogs, settings] = await Promise.all([
    db.learningItems.toArray(),
    db.vocabTestSessions.toArray(),
    db.reviewSessions.toArray(),
    db.learningReviewLogs.toArray(),
    db.learningSettings.toCollection().first(),
  ])

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    items: items.map(serializeLearningItem),
    vocabTestSessions: vocabTestSessions.map(serializeVocabTestSession),
    reviewSessions: reviewSessions.map(serializeReviewSession),
    reviewLogs: reviewLogs.map(serializeLearningReviewLog),
    settings: settings ? serializeLearningSettings(settings) : undefined,
  }
}

export async function mergeLearningData(remote: LearningDataExport) {
  const remoteItems = (remote.items ?? []).map(deserializeLearningItem)
  const remoteVocabSessions = (remote.vocabTestSessions ?? remote.vocabTests ?? []).map(deserializeVocabTestSession)
  const remoteReviewSessions = (remote.reviewSessions ?? []).map(deserializeReviewSession)
  const remoteReviewLogs = (remote.reviewLogs ?? []).map(deserializeLearningReviewLog)
  const remoteSettings = remote.settings ? deserializeLearningSettings(remote.settings) : undefined

  await db.transaction("rw", [db.learningItems, db.vocabTestSessions, db.reviewSessions, db.learningReviewLogs, db.learningSettings], async () => {
    for (const item of remoteItems) {
      const local = await db.learningItems.get(item.id)
      await db.learningItems.put(local ? newerByUpdatedAt(local, item) : item)
    }

    for (const session of remoteVocabSessions) {
      const local = await db.vocabTestSessions.get(session.id)
      await db.vocabTestSessions.put(local ? newerByUpdatedAt(local, session) : session)
    }

    for (const session of remoteReviewSessions) {
      const local = await db.reviewSessions.get(session.id)
      await db.reviewSessions.put(local ? newerByUpdatedAt(local, session) : session)
    }

    for (const log of remoteReviewLogs) {
      const local = await db.learningReviewLogs.get(log.id)
      await db.learningReviewLogs.put(local ? newerByUpdatedAt(local, log) : log)
    }

    if (remoteSettings) {
      const local = await db.learningSettings.get(remoteSettings.id)
      await db.learningSettings.put(local ? newerByUpdatedAt(local, remoteSettings) : remoteSettings)
    }
  })
}
