import type { LearningBridgeConfig, LearningBridgeProjectionCache } from "./types"
import type {
  LearningCaptureSelectionRequest,
  LearningQwertyChapterRecordRequest,
  LearningQwertyWordRecordRequest,
} from "@/utils/learning-contracts"
import { storage } from "#imports"
import { LEARNING_DAEMON_DEFAULT_BASE_URL } from "@/utils/learning-contracts"

export const LEARNING_BRIDGE_CONFIG_KEY = "local:learningBridgeConfig"
export const LEARNING_BRIDGE_PENDING_CAPTURES_KEY = "local:learningBridgePendingCaptures"
export const LEARNING_BRIDGE_PENDING_QWERTY_WORD_RECORDS_KEY = "local:learningBridgePendingQwertyWordRecords"
export const LEARNING_BRIDGE_PENDING_QWERTY_CHAPTER_RECORDS_KEY = "local:learningBridgePendingQwertyChapterRecords"
export const LEARNING_BRIDGE_PROJECTION_CACHE_KEY = "local:learningBridgeProjectionCache"
export const MAX_PENDING_LEARNING_CAPTURES = 100
export const MAX_PENDING_LEARNING_QWERTY_RECORDS = 500
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

export async function getPendingLearningQwertyWordRecords(): Promise<LearningQwertyWordRecordRequest[]> {
  return await storage.getItem<LearningQwertyWordRecordRequest[]>(LEARNING_BRIDGE_PENDING_QWERTY_WORD_RECORDS_KEY) ?? []
}

export async function replacePendingLearningQwertyWordRecords(
  records: LearningQwertyWordRecordRequest[],
): Promise<void> {
  await storage.setItem(LEARNING_BRIDGE_PENDING_QWERTY_WORD_RECORDS_KEY, records.slice(-MAX_PENDING_LEARNING_QWERTY_RECORDS))
}

export async function enqueuePendingLearningQwertyWordRecord(
  record: LearningQwertyWordRecordRequest,
): Promise<LearningQwertyWordRecordRequest[]> {
  const next = [...await getPendingLearningQwertyWordRecords(), record].slice(-MAX_PENDING_LEARNING_QWERTY_RECORDS)
  await replacePendingLearningQwertyWordRecords(next)
  return next
}

export async function getPendingLearningQwertyChapterRecords(): Promise<LearningQwertyChapterRecordRequest[]> {
  return await storage.getItem<LearningQwertyChapterRecordRequest[]>(LEARNING_BRIDGE_PENDING_QWERTY_CHAPTER_RECORDS_KEY) ?? []
}

export async function replacePendingLearningQwertyChapterRecords(
  records: LearningQwertyChapterRecordRequest[],
): Promise<void> {
  await storage.setItem(LEARNING_BRIDGE_PENDING_QWERTY_CHAPTER_RECORDS_KEY, records.slice(-MAX_PENDING_LEARNING_QWERTY_RECORDS))
}

export async function enqueuePendingLearningQwertyChapterRecord(
  record: LearningQwertyChapterRecordRequest,
): Promise<LearningQwertyChapterRecordRequest[]> {
  const next = [...await getPendingLearningQwertyChapterRecords(), record].slice(-MAX_PENDING_LEARNING_QWERTY_RECORDS)
  await replacePendingLearningQwertyChapterRecords(next)
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
