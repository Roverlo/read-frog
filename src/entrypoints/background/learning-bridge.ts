import {
  flushLearningBridgeQueue,
  getLearningBridgeStatus,
  syncLearningCaptureSelection,
} from "@/utils/learning-bridge"
import { onMessage } from "@/utils/message"

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
}
