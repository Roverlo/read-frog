import type {
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
} from "@/utils/learning-contracts"

export interface LearningBridgeConfig {
  enabled: boolean
  baseUrl: string
  token?: string
  updatedAt?: string
}

export type LearningBridgeState
  = | "connected"
    | "offline"
    | "disabled"
    | "incompatible"
    | "unauthorized"

export interface LearningBridgeStatus {
  state: LearningBridgeState
  connected: boolean
  pendingCaptureCount: number
  daemon?: LearningDaemonHealthResponse
  error?: string
}

export interface LearningBridgeCaptureResult {
  status: "synced" | "queued" | "disabled"
  pendingCaptureCount: number
  flushedCaptureCount: number
  error?: string
}

export interface LearningBridgeFlushResult {
  status: "flushed" | "offline" | "disabled"
  pendingCaptureCount: number
  flushedCaptureCount: number
  error?: string
}

export interface LearningCaptureQueueStore {
  getConfig: () => Promise<LearningBridgeConfig>
  getPendingCaptures: () => Promise<LearningCaptureSelectionRequest[]>
  replacePendingCaptures: (captures: LearningCaptureSelectionRequest[]) => Promise<void>
  enqueueCapture: (capture: LearningCaptureSelectionRequest) => Promise<LearningCaptureSelectionRequest[]>
}
