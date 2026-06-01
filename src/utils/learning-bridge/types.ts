import type {
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
  MasteryProjectionEntry,
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

export interface LearningBridgeProjectionTermsResult {
  status: "ok" | "cached" | "offline" | "disabled" | "incompatible"
  projectionVersion?: string
  entries: MasteryProjectionEntry[]
  error?: string
}

export interface LearningBridgeProjectionSyncResult {
  status: "synced" | "offline" | "disabled" | "incompatible"
  projectionVersion?: string
  entryCount: number
  error?: string
}

export interface LearningBridgeProjectionCache {
  projectionVersion?: string
  eventId?: string
  syncedAt?: string
  entries: MasteryProjectionEntry[]
}

export interface LearningCaptureQueueStore {
  getConfig: () => Promise<LearningBridgeConfig>
  getPendingCaptures: () => Promise<LearningCaptureSelectionRequest[]>
  replacePendingCaptures: (captures: LearningCaptureSelectionRequest[]) => Promise<void>
  enqueueCapture: (capture: LearningCaptureSelectionRequest) => Promise<LearningCaptureSelectionRequest[]>
  getProjectionCache: () => Promise<LearningBridgeProjectionCache>
  replaceProjectionCache: (cache: LearningBridgeProjectionCache) => Promise<void>
}
