import type {
  LearningDataExport,
  LearningItem,
  ReviewSession,
  SerializedLearningItem,
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
  }
}

function deserializeLearningItem(item: SerializedLearningItem): LearningItem {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    masteredAt: item.masteredAt ? new Date(item.masteredAt) : undefined,
    nextReviewAt: item.nextReviewAt ? new Date(item.nextReviewAt) : undefined,
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

function newerByUpdatedAt<T extends { updatedAt: Date }>(left: T, right: T) {
  return left.updatedAt.getTime() >= right.updatedAt.getTime() ? left : right
}

export async function exportLearningData(): Promise<LearningDataExport> {
  const [items, vocabTestSessions, reviewSessions] = await Promise.all([
    db.learningItems.toArray(),
    db.vocabTestSessions.toArray(),
    db.reviewSessions.toArray(),
  ])

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    items: items.map(serializeLearningItem),
    vocabTestSessions: vocabTestSessions.map(serializeVocabTestSession),
    reviewSessions: reviewSessions.map(serializeReviewSession),
  }
}

export async function mergeLearningData(remote: LearningDataExport) {
  const remoteItems = remote.items.map(deserializeLearningItem)
  const remoteVocabSessions = remote.vocabTestSessions.map(deserializeVocabTestSession)
  const remoteReviewSessions = remote.reviewSessions.map(deserializeReviewSession)

  await db.transaction("rw", db.learningItems, db.vocabTestSessions, db.reviewSessions, async () => {
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
  })
}
