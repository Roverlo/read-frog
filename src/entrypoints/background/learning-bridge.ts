import { browser } from "#imports"
import {
  flushLearningBridgeQueue,
  getLearningBridgeStatus,
  getLearningProjectionTerms,
  getLearningWorkspaceStateFromDaemon,
  migrateLegacyLearningDataToDaemon,
  syncLearningCaptureSelection,
  syncLearningQwertyChapterRecord,
  syncLearningProjectionCache,
  syncLearningQwertyWordRecord,
} from "@/utils/learning-bridge"
import { logger } from "@/utils/logger"
import { onMessage, sendMessage } from "@/utils/message"
import { getPageTranslationEnabled } from "./page-translation-state"

export const LEARNING_PROJECTION_SYNC_ALARM = "learning-projection-sync"
export const LEARNING_PROJECTION_SYNC_INTERVAL_MINUTES = 5

export async function notifyLearningProjectionChangedTabs(
  tabsApi: Pick<typeof browser.tabs, "query"> = browser.tabs,
) {
  const tabs = await tabsApi.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number")
        return

      if (!await getPageTranslationEnabled(tab.id))
        return

      await sendMessage("refreshLearningPageTranslation", undefined, tab.id)
        .catch(error => logger.warn("Failed to refresh learning page translation", error))
    }),
  )
}

async function syncLearningProjectionCacheAndNotifyIfChanged(
  tabsApi: Pick<typeof browser.tabs, "query"> = browser.tabs,
) {
  const result = await syncLearningProjectionCache()
  if (result.status === "synced" && result.changed) {
    await notifyLearningProjectionChangedTabs(tabsApi)
  }
  return result
}

async function refreshLearningProjectionCacheAfterWrite(
  tabsApi: Pick<typeof browser.tabs, "query"> = browser.tabs,
) {
  await syncLearningProjectionCacheAndNotifyIfChanged(tabsApi)
    .catch(error => logger.warn("Failed to refresh learning projection after write", error))
}

function resultFlushedProjectionData(result: {
  flushedCaptureCount?: number
  flushedQwertyWordRecordCount?: number
}) {
  return (result.flushedCaptureCount ?? 0) > 0 || (result.flushedQwertyWordRecordCount ?? 0) > 0
}

export function setupLearningBridgeMessageHandlers(
  tabsApi: Pick<typeof browser.tabs, "query"> = browser.tabs,
) {
  onMessage("getLearningBridgeStatus", async () => {
    return await getLearningBridgeStatus()
  })

  onMessage("syncLearningCaptureSelection", async (message) => {
    const result = await syncLearningCaptureSelection(message.data)
    if (result.status === "synced" || resultFlushedProjectionData(result)) {
      await refreshLearningProjectionCacheAfterWrite(tabsApi)
    }
    return result
  })

  onMessage("syncLearningQwertyWordRecord", async (message) => {
    const result = await syncLearningQwertyWordRecord(message.data)
    if (result.status === "synced" || resultFlushedProjectionData(result)) {
      await refreshLearningProjectionCacheAfterWrite(tabsApi)
    }
    return result
  })

  onMessage("syncLearningQwertyChapterRecord", async (message) => {
    const result = await syncLearningQwertyChapterRecord(message.data)
    if (resultFlushedProjectionData(result)) {
      await refreshLearningProjectionCacheAfterWrite(tabsApi)
    }
    return result
  })

  onMessage("getLearningWorkspaceState", async () => {
    return await getLearningWorkspaceStateFromDaemon()
  })

  onMessage("migrateLegacyLearningDataToDaemon", async () => {
    const result = await migrateLegacyLearningDataToDaemon()
    if (result.status === "imported") {
      await refreshLearningProjectionCacheAfterWrite(tabsApi)
    }
    return result
  })

  onMessage("flushLearningBridgeQueue", async () => {
    const result = await flushLearningBridgeQueue()
    if (
      result.status === "flushed"
      && resultFlushedProjectionData(result)
    ) {
      await refreshLearningProjectionCacheAfterWrite(tabsApi)
    }
    return result
  })

  onMessage("getLearningProjectionTerms", async (message) => {
    return await getLearningProjectionTerms(message.data.terms)
  })

  onMessage("syncLearningProjectionCache", async () => {
    return await syncLearningProjectionCacheAndNotifyIfChanged(tabsApi)
  })
}

export async function setupLearningProjectionSyncAlarm(
  alarms: typeof browser.alarms = browser.alarms,
  tabsApi: Pick<typeof browser.tabs, "query"> = browser.tabs,
) {
  const existingAlarm = await alarms.get(LEARNING_PROJECTION_SYNC_ALARM)
  if (!existingAlarm) {
    void alarms.create(LEARNING_PROJECTION_SYNC_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: LEARNING_PROJECTION_SYNC_INTERVAL_MINUTES,
    })
  }

  alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === LEARNING_PROJECTION_SYNC_ALARM) {
      void syncLearningProjectionCacheAndNotifyIfChanged(tabsApi)
    }
  })
}
