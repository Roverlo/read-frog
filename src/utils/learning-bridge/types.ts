import type {
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
  LearningQwertyChapterRecordRequest,
  LearningQwertyChapterRecordResponse,
  LearningQwertyWordRecordRequest,
  LearningQwertyWordRecordResponse,
  LearningWorkspaceStateResponse,
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
  pendingQwertyWordRecordCount: number
  pendingQwertyChapterRecordCount: number
  daemon?: LearningDaemonHealthResponse
  error?: string
}

export interface LearningBridgeCaptureResult {
  status: "synced" | "queued" | "disabled"
  pendingCaptureCount: number
  flushedCaptureCount: number
  flushedQwertyWordRecordCount?: number
  flushedQwertyChapterRecordCount?: number
  error?: string
}

export interface LearningBridgeFlushResult {
  status: "flushed" | "offline" | "disabled"
  pendingCaptureCount: number
  pendingQwertyWordRecordCount: number
  pendingQwertyChapterRecordCount: number
  flushedCaptureCount: number
  flushedQwertyWordRecordCount: number
  flushedQwertyChapterRecordCount: number
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
  changed: boolean
  error?: string
}

export interface LearningBridgeQwertyWordRecordResult {
  status: "synced" | "queued" | "disabled" | "incompatible"
  pendingQwertyWordRecordCount?: number
  flushedCaptureCount?: number
  flushedQwertyWordRecordCount?: number
  flushedQwertyChapterRecordCount?: number
  response?: LearningQwertyWordRecordResponse
  error?: string
}

export interface LearningBridgeQwertyChapterRecordResult {
  status: "synced" | "queued" | "disabled" | "incompatible"
  pendingQwertyChapterRecordCount?: number
  flushedCaptureCount?: number
  flushedQwertyWordRecordCount?: number
  flushedQwertyChapterRecordCount?: number
  response?: LearningQwertyChapterRecordResponse
  error?: string
}

export interface LearningBridgeWorkspaceStateResult {
  status: "ok" | "offline" | "disabled" | "incompatible"
  state?: LearningWorkspaceStateResponse
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
  getPendingQwertyWordRecords: () => Promise<LearningQwertyWordRecordRequest[]>
  replacePendingQwertyWordRecords: (records: LearningQwertyWordRecordRequest[]) => Promise<void>
  enqueueQwertyWordRecord: (record: LearningQwertyWordRecordRequest) => Promise<LearningQwertyWordRecordRequest[]>
  getPendingQwertyChapterRecords: () => Promise<LearningQwertyChapterRecordRequest[]>
  replacePendingQwertyChapterRecords: (records: LearningQwertyChapterRecordRequest[]) => Promise<void>
  enqueueQwertyChapterRecord: (record: LearningQwertyChapterRecordRequest) => Promise<LearningQwertyChapterRecordRequest[]>
  getProjectionCache: () => Promise<LearningBridgeProjectionCache>
  replaceProjectionCache: (cache: LearningBridgeProjectionCache) => Promise<void>
}
