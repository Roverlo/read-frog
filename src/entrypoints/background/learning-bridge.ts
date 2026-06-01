import { browser } from "#imports"
import {
  flushLearningBridgeQueue,
  getLearningBridgeStatus,
  getLearningProjectionTerms,
  syncLearningCaptureSelection,
  syncLearningProjectionCache,
} from "@/utils/learning-bridge"
import { onMessage } from "@/utils/message"

export const LEARNING_PROJECTION_SYNC_ALARM = "learning-projection-sync"
export const LEARNING_PROJECTION_SYNC_INTERVAL_MINUTES = 5

export function setupLearningBridgeMessageHandlers() {
  onMessage("getLearningBridgeStatus", async () => {
    return await getLearningBridgeStatus()
  })

  onMessage("syncLearningCaptureSelection", async (message) => {
    return await syncLearningCaptureSelection(message.data)
  })

  onMessage("flushLearningBridgeQueue", async () => {
    return await flushLearningBridgeQueue()
  })

  onMessage("getLearningProjectionTerms", async (message) => {
    return await getLearningProjectionTerms(message.data.terms)
  })

  onMessage("syncLearningProjectionCache", async () => {
    return await syncLearningProjectionCache()
  })
}

export async function setupLearningProjectionSyncAlarm(
  alarms: typeof browser.alarms = browser.alarms,
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
      void syncLearningProjectionCache()
    }
  })
}
