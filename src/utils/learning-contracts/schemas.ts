import { z } from "zod"

export const LEARNING_CONTRACT_VERSION = 1
export const LEARNING_DAEMON_SERVICE = "read-frog-learning-daemon"
export const LEARNING_DAEMON_DEFAULT_BASE_URL = "http://127.0.0.1:7457"
export const MAX_MASTERY_PROJECTION_TERMS = 200

export const learningItemKindSchema = z.enum(["word", "phrase", "sentence", "paragraph"])

export const learningProjectionStatusSchema = z.enum([
  "unknown",
  "learning",
  "review",
  "mature",
  "archived",
])

export const learningExplanationWireSchema = z.object({
  meaningZh: z.string().optional(),
  examples: z.array(z.string()).default([]),
  notes: z.string().optional(),
})

export const learningCaptureExtractedItemSchema = z.object({
  text: z.string().trim().min(1),
  kind: learningItemKindSchema.default("word"),
  explanation: learningExplanationWireSchema.optional(),
  tags: z.array(z.string()).default([]),
})

export const learningCaptureSelectionInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  context: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  explanation: learningExplanationWireSchema.optional(),
  extractedItems: z.array(learningCaptureExtractedItemSchema).default([]),
  createdAt: z.string().datetime().optional(),
})

export const learningCaptureSelectionRequestSchema = learningCaptureSelectionInputSchema.extend({
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
})

export const learningCaptureSelectionResponseSchema = z.object({
  ok: z.literal(true),
  itemIds: z.array(z.string()).default([]),
  projectionVersion: z.string().optional(),
})

export const learningDaemonHealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal(LEARNING_DAEMON_SERVICE),
  contractVersion: z.number().int().min(1),
  projectionVersion: z.string().optional(),
  paired: z.boolean().optional(),
})

export const masteryProjectionEntrySchema = z.object({
  normalizedText: z.string().trim().min(1),
  kind: learningItemKindSchema,
  status: learningProjectionStatusSchema,
  confidence: z.number().min(0).max(1),
  dueAt: z.string().datetime().optional(),
  definition: z.string().optional(),
  updatedAt: z.string().datetime(),
})

export const learningQwertyMistakeSchema = z.object({
  expected: z.string(),
  actual: z.string(),
  index: z.number().int().min(0),
})

export const learningQwertyWordRecordRequestSchema = z.object({
  id: z.string().trim().min(1).optional(),
  word: z.string().trim().min(1),
  input: z.string().default(""),
  correct: z.boolean(),
  accuracy: z.number().min(0).max(1),
  durationMs: z.number().int().nonnegative(),
  dictId: z.string().trim().min(1).optional(),
  dictName: z.string().trim().min(1).optional(),
  chapterIndex: z.number().int().nonnegative().optional(),
  wordIndex: z.number().int().nonnegative().optional(),
  definition: z.string().optional(),
  mistakes: z.array(learningQwertyMistakeSchema).default([]),
  createdAt: z.string().datetime().optional(),
})

export const masteryProjectionResponseSchema = z.object({
  ok: z.literal(true),
  projectionVersion: z.string(),
  eventId: z.string().optional(),
  entries: z.array(masteryProjectionEntrySchema),
})

export const learningQwertyWordRecordResponseSchema = z.object({
  ok: z.literal(true),
  itemId: z.string(),
  projectionVersion: z.string(),
  entry: masteryProjectionEntrySchema,
})

export const learningQwertyChapterRecordRequestSchema = z.object({
  id: z.string().trim().min(1).optional(),
  dictId: z.string().trim().min(1),
  dictName: z.string().trim().min(1).optional(),
  chapterIndex: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  wrongCount: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  correctWordIndexes: z.array(z.number().int().nonnegative()).default([]),
  createdAt: z.string().datetime().optional(),
})

export const learningQwertyChapterRecordResponseSchema = z.object({
  ok: z.literal(true),
  recordId: z.string(),
  projectionVersion: z.string(),
})

export const learningQwertyDictionaryResourceSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().default(""),
  category: z.string().default(""),
  tags: z.array(z.string()).default([]),
  length: z.number().int().nonnegative(),
  chapterLength: z.number().int().positive(),
  chapterCount: z.number().int().positive(),
  language: z.literal("en"),
})

export const learningQwertyWordSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().trim().min(1),
  trans: z.array(z.string()).default([]),
  usphone: z.string().optional(),
  ukphone: z.string().optional(),
  notation: z.string().optional(),
})

export const learningQwertyDictionariesResponseSchema = z.object({
  ok: z.literal(true),
  dictionaries: z.array(learningQwertyDictionaryResourceSchema),
})

export const learningQwertyDictionaryChapterResponseSchema = z.object({
  ok: z.literal(true),
  dictionary: learningQwertyDictionaryResourceSchema,
  chapterIndex: z.number().int().nonnegative(),
  words: z.array(learningQwertyWordSchema),
})

export const learningWorkspaceCaptureSummarySchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  context: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  extractedCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})

export const learningWorkspaceQwertyRecordSummarySchema = z.object({
  id: z.string().trim().min(1).optional(),
  word: z.string().trim().min(1),
  input: z.string(),
  correct: z.boolean(),
  accuracy: z.number().min(0).max(1),
  durationMs: z.number().int().nonnegative(),
  dictId: z.string().trim().min(1).optional(),
  dictName: z.string().trim().min(1).optional(),
  chapterIndex: z.number().int().nonnegative().optional(),
  wordIndex: z.number().int().nonnegative().optional(),
  mistakeCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})

export const learningWorkspaceQwertyChapterRecordSummarySchema = z.object({
  id: z.string().trim().min(1).optional(),
  dictId: z.string().trim().min(1),
  dictName: z.string().trim().min(1).optional(),
  chapterIndex: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  wrongCount: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
})

export const learningWorkspaceQwertyMistakeWordSummarySchema = z.object({
  word: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  lastInput: z.string(),
  lastAccuracy: z.number().min(0).max(1),
  lastPracticedAt: z.string().datetime(),
})

export const learningWorkspaceQwertyMistakeKeySummarySchema = z.object({
  expected: z.string(),
  actual: z.string(),
  count: z.number().int().nonnegative(),
})

export const learningWorkspaceQwertyMistakesSummarySchema = z.object({
  words: z.array(learningWorkspaceQwertyMistakeWordSummarySchema),
  keys: z.array(learningWorkspaceQwertyMistakeKeySummarySchema),
})

export const learningWorkspaceStatsSchema = z.object({
  captureCount: z.number().int().nonnegative(),
  qwertyRecordCount: z.number().int().nonnegative(),
  qwertyChapterRecordCount: z.number().int().nonnegative(),
  correctQwertyRecordCount: z.number().int().nonnegative(),
  projectionEntryCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  learningCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  matureCount: z.number().int().nonnegative(),
  archivedCount: z.number().int().nonnegative(),
  averageAccuracy: z.number().min(0).max(1),
})

export const learningWorkspaceStateResponseSchema = z.object({
  ok: z.literal(true),
  projectionVersion: z.string(),
  eventId: z.string().optional(),
  stats: learningWorkspaceStatsSchema,
  captures: z.array(learningWorkspaceCaptureSummarySchema),
  qwertyWordRecords: z.array(learningWorkspaceQwertyRecordSummarySchema),
  qwertyChapterRecords: z.array(learningWorkspaceQwertyChapterRecordSummarySchema),
  qwertyMistakes: learningWorkspaceQwertyMistakesSummarySchema,
})

export const masteryProjectionTermsRequestSchema = z.object({
  terms: z.array(z.string().trim().min(1)).min(1).max(MAX_MASTERY_PROJECTION_TERMS),
})

export type LearningItemKindWire = z.infer<typeof learningItemKindSchema>
export type LearningProjectionStatus = z.infer<typeof learningProjectionStatusSchema>
export type LearningExplanationWire = z.infer<typeof learningExplanationWireSchema>
export type LearningCaptureExtractedItem = z.infer<typeof learningCaptureExtractedItemSchema>
export type LearningCaptureSelectionInput = z.input<typeof learningCaptureSelectionInputSchema>
export type LearningCaptureSelectionRequest = z.infer<typeof learningCaptureSelectionRequestSchema>
export type LearningCaptureSelectionResponse = z.infer<typeof learningCaptureSelectionResponseSchema>
export type LearningDaemonHealthResponse = z.infer<typeof learningDaemonHealthResponseSchema>
export type LearningQwertyMistake = z.infer<typeof learningQwertyMistakeSchema>
export type LearningQwertyDictionariesResponse = z.infer<typeof learningQwertyDictionariesResponseSchema>
export type LearningQwertyDictionaryChapterResponse = z.infer<typeof learningQwertyDictionaryChapterResponseSchema>
export type LearningQwertyDictionaryResource = z.infer<typeof learningQwertyDictionaryResourceSchema>
export type LearningQwertyWord = z.infer<typeof learningQwertyWordSchema>
export type LearningQwertyChapterRecordRequest = z.infer<typeof learningQwertyChapterRecordRequestSchema>
export type LearningQwertyChapterRecordResponse = z.infer<typeof learningQwertyChapterRecordResponseSchema>
export type LearningQwertyWordRecordRequest = z.infer<typeof learningQwertyWordRecordRequestSchema>
export type LearningQwertyWordRecordResponse = z.infer<typeof learningQwertyWordRecordResponseSchema>
export type LearningWorkspaceCaptureSummary = z.infer<typeof learningWorkspaceCaptureSummarySchema>
export type LearningWorkspaceQwertyChapterRecordSummary = z.infer<typeof learningWorkspaceQwertyChapterRecordSummarySchema>
export type LearningWorkspaceQwertyMistakesSummary = z.infer<typeof learningWorkspaceQwertyMistakesSummarySchema>
export type LearningWorkspaceQwertyRecordSummary = z.infer<typeof learningWorkspaceQwertyRecordSummarySchema>
export type LearningWorkspaceStateResponse = z.infer<typeof learningWorkspaceStateResponseSchema>
export type LearningWorkspaceStats = z.infer<typeof learningWorkspaceStatsSchema>
export type MasteryProjectionEntry = z.infer<typeof masteryProjectionEntrySchema>
export type MasteryProjectionResponse = z.infer<typeof masteryProjectionResponseSchema>
export type MasteryProjectionTermsRequest = z.infer<typeof masteryProjectionTermsRequestSchema>
