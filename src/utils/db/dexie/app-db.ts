import type { EntityTable } from "dexie"
import { upperCamelCase } from "case-anything"
import Dexie from "dexie"
import { APP_NAME } from "@/utils/constants/app"
import AiSegmentationCache from "./tables/ai-segmentation-cache"
import ArticleSummaryCache from "./tables/article-summary-cache"
import BatchRequestRecord from "./tables/batch-request-record"
import GithubLearningSyncConfig from "./tables/github-learning-sync-config"
import LearningItem from "./tables/learning-item"
import ReviewSession from "./tables/review-session"
import TranslationCache from "./tables/translation-cache"
import VocabTestSession from "./tables/vocab-test-session"

export default class AppDB extends Dexie {
  translationCache!: EntityTable<
    TranslationCache,
    "key"
  >

  batchRequestRecord!: EntityTable<
    BatchRequestRecord,
    "key"
  >

  articleSummaryCache!: EntityTable<
    ArticleSummaryCache,
    "key"
  >

  aiSegmentationCache!: EntityTable<
    AiSegmentationCache,
    "key"
  >

  learningItems!: EntityTable<
    LearningItem,
    "id"
  >

  vocabTestSessions!: EntityTable<
    VocabTestSession,
    "id"
  >

  reviewSessions!: EntityTable<
    ReviewSession,
    "id"
  >

  githubLearningSyncConfig!: EntityTable<
    GithubLearningSyncConfig,
    "id"
  >

  constructor() {
    super(`${upperCamelCase(APP_NAME)}DB`)
    this.version(1).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
    })
    this.version(2).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
    })
    this.version(3).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
    })
    this.version(4).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
    })
    this.version(5).stores({
      translationCache: `
        key,
        translation,
        createdAt`,
      batchRequestRecord: `
        key,
        createdAt,
        originalRequestCount,
        provider,
        model`,
      articleSummaryCache: `
        key,
        createdAt`,
      aiSegmentationCache: `
        key,
        createdAt`,
      learningItems: `
        id,
        normalizedText,
        status,
        kind,
        source,
        updatedAt,
        nextReviewAt`,
      vocabTestSessions: `
        id,
        createdAt,
        updatedAt`,
      reviewSessions: `
        id,
        createdAt,
        updatedAt,
        passed`,
      githubLearningSyncConfig: `
        id,
        updatedAt`,
    })
    this.translationCache.mapToClass(TranslationCache)
    this.batchRequestRecord.mapToClass(BatchRequestRecord)
    this.articleSummaryCache.mapToClass(ArticleSummaryCache)
    this.aiSegmentationCache.mapToClass(AiSegmentationCache)
    this.learningItems.mapToClass(LearningItem)
    this.vocabTestSessions.mapToClass(VocabTestSession)
    this.reviewSessions.mapToClass(ReviewSession)
    this.githubLearningSyncConfig.mapToClass(GithubLearningSyncConfig)
  }
}
