import type { z } from "zod"
import type {
  LearningCaptureSelectionRequest,
  LearningCaptureSelectionResponse,
  LearningDaemonHealthResponse,
  MasteryProjectionResponse,
} from "@/utils/learning-contracts"
import {
  learningCaptureSelectionResponseSchema,
  learningDaemonHealthResponseSchema,
  masteryProjectionResponseSchema,
} from "@/utils/learning-contracts"

export class LearningDaemonHttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    message = `Learning daemon request failed: ${status} ${statusText}`,
  ) {
    super(message)
    this.name = "LearningDaemonHttpError"
  }
}

export interface LearningDaemonClientOptions {
  baseUrl: string
  token?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

interface RequestJsonOptions extends LearningDaemonClientOptions {
  method?: "GET" | "POST"
  body?: unknown
}

const DEFAULT_TIMEOUT_MS = 2_500

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestJsonOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const headers = new Headers({
      accept: "application/json",
    })
    if (options.body !== undefined) {
      headers.set("content-type", "application/json")
    }
    if (options.token?.trim()) {
      headers.set("authorization", `Bearer ${options.token.trim()}`)
    }

    const response = await fetchImpl(joinUrl(options.baseUrl, path), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new LearningDaemonHttpError(response.status, response.statusText)
    }

    return schema.parse(await response.json())
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function getLearningDaemonHealth(
  options: LearningDaemonClientOptions,
): Promise<LearningDaemonHealthResponse> {
  return requestJson("/api/v1/health", learningDaemonHealthResponseSchema, options)
}

export async function postLearningCaptureSelection(
  request: LearningCaptureSelectionRequest,
  options: LearningDaemonClientOptions,
): Promise<LearningCaptureSelectionResponse> {
  return requestJson("/api/v1/capture/selection", learningCaptureSelectionResponseSchema, {
    ...options,
    method: "POST",
    body: request,
  })
}

export async function getLearningMasteryProjection(
  options: LearningDaemonClientOptions & { since?: string },
): Promise<MasteryProjectionResponse> {
  const query = options.since ? `?since=${encodeURIComponent(options.since)}` : ""
  return requestJson(`/api/v1/projection${query}`, masteryProjectionResponseSchema, options)
}

export async function getLearningMasteryProjectionTerms(
  terms: string[],
  options: LearningDaemonClientOptions,
): Promise<MasteryProjectionResponse> {
  const query = terms
    .map(term => term.trim())
    .filter(Boolean)
    .map(term => `terms=${encodeURIComponent(term)}`)
    .join("&")
  return requestJson(`/api/v1/projection/terms?${query}`, masteryProjectionResponseSchema, options)
}
