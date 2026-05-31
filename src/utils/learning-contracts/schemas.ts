import { z } from "zod"

export const LEARNING_CONTRACT_VERSION = 1
export const LEARNING_DAEMON_SERVICE = "read-frog-learning-daemon"
export const LEARNING_DAEMON_DEFAULT_BASE_URL = "http://127.0.0.1:7457"

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

export const masteryProjectionResponseSchema = z.object({
  ok: z.literal(true),
  projectionVersion: z.string(),
  eventId: z.string().optional(),
  entries: z.array(masteryProjectionEntrySchema),
})

export type LearningItemKindWire = z.infer<typeof learningItemKindSchema>
export type LearningProjectionStatus = z.infer<typeof learningProjectionStatusSchema>
export type LearningExplanationWire = z.infer<typeof learningExplanationWireSchema>
export type LearningCaptureExtractedItem = z.infer<typeof learningCaptureExtractedItemSchema>
export type LearningCaptureSelectionInput = z.input<typeof learningCaptureSelectionInputSchema>
export type LearningCaptureSelectionRequest = z.infer<typeof learningCaptureSelectionRequestSchema>
export type LearningCaptureSelectionResponse = z.infer<typeof learningCaptureSelectionResponseSchema>
export type LearningDaemonHealthResponse = z.infer<typeof learningDaemonHealthResponseSchema>
export type MasteryProjectionEntry = z.infer<typeof masteryProjectionEntrySchema>
export type MasteryProjectionResponse = z.infer<typeof masteryProjectionResponseSchema>
