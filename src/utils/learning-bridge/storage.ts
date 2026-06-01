import type { LearningBridgeConfig, LearningBridgeProjectionCache } from "./types"
import type { LearningCaptureSelectionRequest } from "@/utils/learning-contracts"
import { storage } from "#imports"
import { LEARNING_DAEMON_DEFAULT_BASE_URL } from "@/utils/learning-contracts"

export const LEARNING_BRIDGE_CONFIG_KEY = "local:learningBridgeConfig"
export const LEARNING_BRIDGE_PENDING_CAPTURES_KEY = "local:learningBridgePendingCaptures"
export const LEARNING_BRIDGE_PROJECTION_CACHE_KEY = "local:learningBridgeProjectionCache"
export const MAX_PENDING_LEARNING_CAPTURES = 100
export const MAX_LEARNING_PROJECTION_CACHE_ENTRIES = 5_000

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

function normalizeProjectionCache(cache: Partial<LearningBridgeProjectionCache> | null | undefined): LearningBridgeProjectionCache {
  return {
    projectionVersion: cache?.projectionVersion,
    eventId: cache?.eventId,
    syncedAt: cache?.syncedAt,
    entries: cache?.entries ?? [],
  }
}

export async function getLearningProjectionCache(): Promise<LearningBridgeProjectionCache> {
  return normalizeProjectionCache(
    await storage.getItem<Partial<LearningBridgeProjectionCache>>(LEARNING_BRIDGE_PROJECTION_CACHE_KEY),
  )
}

export async function replaceLearningProjectionCache(cache: LearningBridgeProjectionCache): Promise<void> {
  await storage.setItem(LEARNING_BRIDGE_PROJECTION_CACHE_KEY, {
    ...cache,
    entries: cache.entries.slice(0, MAX_LEARNING_PROJECTION_CACHE_ENTRIES),
  })
}
