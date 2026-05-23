import type { LearningSettings } from "@/types/learning"
import { db } from "@/utils/db/dexie/db"

export const LEARNING_SETTINGS_ID = "learning-settings"

export const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
  id: LEARNING_SETTINGS_ID,
  desiredRetention: 0.9,
  reviewMode: "story",
  includeMasteredInReview: false,
  selectionSaveEnabled: true,
  updatedAt: new Date(0),
}

export async function getLearningSettings() {
  const settings = await db.learningSettings.get(LEARNING_SETTINGS_ID)
  return settings ?? {
    ...DEFAULT_LEARNING_SETTINGS,
    updatedAt: new Date(),
  }
}

export async function saveLearningSettings(input: Partial<Omit<LearningSettings, "id" | "updatedAt">>) {
  const current = await getLearningSettings()
  const next: LearningSettings = {
    ...current,
    ...input,
    id: LEARNING_SETTINGS_ID,
    desiredRetention: Math.min(0.97, Math.max(0.75, input.desiredRetention ?? current.desiredRetention)),
    updatedAt: new Date(),
  }
  await db.learningSettings.put(next)
  return next
}
