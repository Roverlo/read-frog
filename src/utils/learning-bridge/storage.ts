import type { LearningBridgeConfig } from "./types"
import type { LearningCaptureSelectionRequest } from "@/utils/learning-contracts"
import { storage } from "#imports"
import { LEARNING_DAEMON_DEFAULT_BASE_URL } from "@/utils/learning-contracts"

export const LEARNING_BRIDGE_CONFIG_KEY = "local:learningBridgeConfig"
export const LEARNING_BRIDGE_PENDING_CAPTURES_KEY = "local:learningBridgePendingCaptures"
export const MAX_PENDING_LEARNING_CAPTURES = 100

export function getDefaultLearningBridgeConfig(now = new Date().toISOString()): LearningBridgeConfig {
  return {
    enabled: true,
    baseUrl: LEARNING_DAEMON_DEFAULT_BASE_URL,
    updatedAt: now,
  }
}

export async function getLearningBridgeConfig(): Promise<LearningBridgeConfig> {
  const stored = await storage.getItem<Partial<LearningBridgeConfig>>(LEARNING_BRIDGE_CONFIG_KEY)
  return {
    ...getDefaultLearningBridgeConfig(),
    ...stored,
  }
}

export async function saveLearningBridgeConfig(config: LearningBridgeConfig): Promise<void> {
  await storage.setItem(LEARNING_BRIDGE_CONFIG_KEY, {
    ...config,
    updatedAt: new Date().toISOString(),
  })
}

export async function getPendingLearningCaptures(): Promise<LearningCaptureSelectionRequest[]> {
  return await storage.getItem<LearningCaptureSelectionRequest[]>(LEARNING_BRIDGE_PENDING_CAPTURES_KEY) ?? []
}

export async function replacePendingLearningCaptures(captures: LearningCaptureSelectionRequest[]): Promise<void> {
  await storage.setItem(LEARNING_BRIDGE_PENDING_CAPTURES_KEY, captures.slice(-MAX_PENDING_LEARNING_CAPTURES))
}

export async function enqueuePendingLearningCapture(
  capture: LearningCaptureSelectionRequest,
): Promise<LearningCaptureSelectionRequest[]> {
  const next = [...await getPendingLearningCaptures(), capture].slice(-MAX_PENDING_LEARNING_CAPTURES)
  await replacePendingLearningCaptures(next)
  return next
}
