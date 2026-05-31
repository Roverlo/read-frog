import type {
  LearningCaptureSelectionInput,
  LearningCaptureSelectionRequest,
} from "./schemas"
import { learningCaptureSelectionInputSchema, learningCaptureSelectionRequestSchema } from "./schemas"

export interface CreateLearningCaptureSelectionRequestOptions {
  id: string
  now: string
}

export function createLearningCaptureSelectionRequest(
  input: LearningCaptureSelectionInput,
  options: CreateLearningCaptureSelectionRequestOptions,
): LearningCaptureSelectionRequest {
  const parsed = learningCaptureSelectionInputSchema.parse(input)
  return learningCaptureSelectionRequestSchema.parse({
    ...parsed,
    id: parsed.id ?? options.id,
    createdAt: parsed.createdAt ?? options.now,
  })
}
