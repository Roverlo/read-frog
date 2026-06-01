import type { LearningItem, LearningReviewLog, QwertyTypingRecord, ReviewSession } from "@/types/learning"
import { describe, expect, it } from "vitest"
import {
  buildLegacyLearningDaemonImportState,
  legacyLearningItemToProjectionEntry,
  legacyLearningItemsToCaptures,
  legacyQwertyRecordToDaemonRecord,
} from "../legacy-migration"

function createLearningItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: "item-1",
    kind: "word",
    text: "Workflow",
    normalizedText: "workflow",
    status: "learning",
    source: "manual",
    tags: [],
    maturity: "review",
    consecutivePasses: 1,
    reviewCount: 2,
    correctCount: 2,
    incorrectCount: 0,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:01:00.000Z"),
    dueAt: new Date("2026-06-02T00:00:00.000Z"),
    explanation: {
      meaningZh: "工作流",
      examples: ["A workflow improves the team."],
    },
    ...overrides,
  }
}

function createQwertyRecord(overrides: Partial<QwertyTypingRecord> = {}): QwertyTypingRecord {
  return {
    id: "record-1",
    itemId: "item-1",
    dictId: "cet4",
    dictName: "CET-4",
    chapterIndex: 0,
    wordIndex: 1,
    word: "workflow",
    input: "workflow",
    correct: true,
    accuracy: 95,
    durationMs: 1200,
    mistakes: [],
    createdAt: new Date("2026-06-01T00:02:00.000Z"),
    updatedAt: new Date("2026-06-01T00:02:00.000Z"),
    ...overrides,
  }
}

describe("legacy learning daemon migration", () => {
  it("maps legacy learning item maturity into mastery projection entries", () => {
    expect(legacyLearningItemToProjectionEntry(createLearningItem({
      status: "mastered",
      maturity: "mature",
      consecutivePasses: 3,
      reviewCount: 4,
      correctCount: 4,
      incorrectCount: 0,
      masteredAt: new Date("2026-06-01T00:03:00.000Z"),
    }))).toMatchObject({
      normalizedText: "workflow",
      kind: "word",
      status: "mature",
      confidence: expect.any(Number),
      definition: "工作流",
      updatedAt: "2026-06-01T00:01:00.000Z",
    })

    expect(legacyLearningItemToProjectionEntry(createLearningItem({
      status: "archived",
      maturity: "learning",
    }))).toMatchObject({
      status: "archived",
    })
  })

  it("turns selection parents and children into daemon captures", () => {
    const capture = legacyLearningItemsToCaptures([
      createLearningItem({
        id: "parent",
        kind: "sentence",
        text: "A repeatable workflow improves teams.",
        normalizedText: "a repeatable workflow improves teams.",
        source: "selection",
        sourceUrl: "https://example.test/article",
        sourceTitle: "Article",
      }),
      createLearningItem({
        id: "child",
        parentId: "parent",
        text: "workflow",
        normalizedText: "workflow",
        source: "selection",
      }),
    ])

    expect(capture).toEqual([
      expect.objectContaining({
        id: "legacy:item:parent",
        text: "A repeatable workflow improves teams.",
        sourceUrl: "https://example.test/article",
        sourceTitle: "Article",
        extractedItems: [
          expect.objectContaining({
            text: "workflow",
            kind: "word",
            explanation: {
              meaningZh: "工作流",
              examples: ["A workflow improves the team."],
              notes: undefined,
            },
          }),
        ],
      }),
    ])
  })

  it("normalizes legacy qwerty accuracy and carries item definitions", () => {
    const item = createLearningItem()
    expect(legacyQwertyRecordToDaemonRecord(
      createQwertyRecord(),
      new Map([[item.id, item]]),
    )).toEqual({
      id: "legacy:qwerty:record-1",
      word: "workflow",
      input: "workflow",
      correct: true,
      accuracy: 0.95,
      durationMs: 1200,
      dictId: "cet4",
      dictName: "CET-4",
      chapterIndex: 0,
      wordIndex: 1,
      definition: "工作流",
      mistakes: [],
      createdAt: "2026-06-01T00:02:00.000Z",
    })
  })

  it("builds a daemon import payload without dropping legacy review data", () => {
    const reviewLog: LearningReviewLog = {
      id: "log-1",
      itemId: "item-1",
      rating: "good",
      correct: true,
      reviewedAt: new Date("2026-06-01T00:03:00.000Z"),
      createdAt: new Date("2026-06-01T00:03:00.000Z"),
      updatedAt: new Date("2026-06-01T00:03:00.000Z"),
    }
    const reviewSession: ReviewSession = {
      id: "session-1",
      createdAt: new Date("2026-06-01T00:04:00.000Z"),
      updatedAt: new Date("2026-06-01T00:04:00.000Z"),
      itemIds: ["item-1"],
      title: "Review",
      material: "A workflow improves teams.",
      questions: [],
      answers: [],
      passed: true,
    }

    expect(buildLegacyLearningDaemonImportState({
      items: [createLearningItem()],
      qwertyTypingRecords: [createQwertyRecord()],
      reviewLogs: [reviewLog],
      reviewSessions: [reviewSession],
    })).toMatchObject({
      captures: [],
      qwertyWordRecords: [
        {
          id: "legacy:qwerty:record-1",
          definition: "工作流",
        },
      ],
      qwertyChapterRecords: [],
      entries: [
        {
          normalizedText: "workflow",
        },
      ],
      legacyReviewLogs: [
        {
          id: "log-1",
          reviewedAt: "2026-06-01T00:03:00.000Z",
        },
      ],
      legacyReviewSessions: [
        {
          id: "session-1",
          createdAt: "2026-06-01T00:04:00.000Z",
        },
      ],
    })
  })
})
