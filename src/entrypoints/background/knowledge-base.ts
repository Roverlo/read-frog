import { browser } from "#imports"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"
import {
  clearTranslationMemory,
  exportTranslationMemory,
  getTranslationMemoryStats,
  recordTranslationMemory,
  retryKnowledgeSyncQueue,
  testKnowledgeBaseSync,
} from "@/utils/knowledge-base/translation-memory"
import { ensureInitializedConfig } from "./config"

export const KNOWLEDGE_SYNC_RETRY_ALARM = "knowledge-sync-retry"
const KNOWLEDGE_SYNC_RETRY_INTERVAL_MINUTES = 15

export function setupKnowledgeBaseMessageHandlers() {
  onMessage("recordTranslationMemory", async (message) => {
    try {
      const config = await ensureInitializedConfig() ?? DEFAULT_CONFIG
      await recordTranslationMemory(message.data, config)
    }
    catch (error) {
      logger.warn("Failed to record translation memory", error)
    }
  })

  onMessage("exportTranslationMemory", async (message) => {
    return await exportTranslationMemory(message.data?.format)
  })

  onMessage("clearTranslationMemory", async () => {
    await clearTranslationMemory()
  })

  onMessage("getTranslationMemoryStats", async () => {
    try {
      return await getTranslationMemoryStats()
    }
    catch (error) {
      logger.warn("Failed to get translation memory stats", error)
      return {
        itemCount: 0,
        eventCount: 0,
        queuedSyncCount: 0,
      }
    }
  })

  onMessage("testKnowledgeBaseSync", async (message) => {
    return await testKnowledgeBaseSync(message.data)
  })
}

export async function setupKnowledgeBaseSyncRetry() {
  try {
    const existingAlarm = await browser.alarms.get(KNOWLEDGE_SYNC_RETRY_ALARM)
    if (!existingAlarm) {
      void browser.alarms.create(KNOWLEDGE_SYNC_RETRY_ALARM, {
        delayInMinutes: KNOWLEDGE_SYNC_RETRY_INTERVAL_MINUTES,
        periodInMinutes: KNOWLEDGE_SYNC_RETRY_INTERVAL_MINUTES,
      })
    }

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== KNOWLEDGE_SYNC_RETRY_ALARM) {
        return
      }

      void ensureInitializedConfig()
        .then(config => retryKnowledgeSyncQueue(config ?? DEFAULT_CONFIG))
        .catch(error => logger.warn("Failed to retry knowledge base sync", error))
    })
  }
  catch (error) {
    logger.warn("Failed to set up knowledge base sync retry", error)
  }
}
