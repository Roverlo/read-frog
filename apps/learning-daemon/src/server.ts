import type { IncomingMessage, ServerResponse } from "node:http"
import type {
  LearningCaptureSelectionRequest,
  LearningDaemonHealthResponse,
  MasteryProjectionResponse,
} from "../../../src/utils/learning-contracts/schemas.ts"
import type { LearningDaemonStore } from "./store.ts"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import {
  LEARNING_CONTRACT_VERSION,
  LEARNING_DAEMON_SERVICE,
  learningCaptureSelectionRequestSchema,
  learningCaptureSelectionResponseSchema,
  learningDaemonHealthResponseSchema,
  masteryProjectionResponseSchema,
  masteryProjectionTermsRequestSchema,
} from "../../../src/utils/learning-contracts/schemas.ts"
import { normalizeLearningDaemonText } from "./store.ts"

export interface LearningDaemonServerOptions {
  store: LearningDaemonStore
  allowedOrigins?: string[]
  maxBodyBytes?: number
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1",
  "http://localhost",
  "chrome-extension://",
  "moz-extension://",
]

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) {
    return false
  }
  return allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))
}

function setCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
) {
  const origin = request.headers.origin
  if (typeof origin === "string" && isAllowedOrigin(origin, allowedOrigins)) {
    response.setHeader("access-control-allow-origin", origin)
    response.setHeader("vary", "Origin")
  }
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS")
  response.setHeader("access-control-allow-headers", "authorization,content-type")
  response.setHeader("access-control-max-age", "600")
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.end(`${JSON.stringify(body)}\n`)
}

function sendError(response: ServerResponse, statusCode: number, message: string) {
  sendJson(response, statusCode, {
    ok: false,
    error: message,
  })
}

async function readJsonBody<T>(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBodyBytes) {
      throw new Error("Request body is too large")
    }
    chunks.push(buffer)
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T
}

function getRequestUrl(request: IncomingMessage) {
  return new URL(request.url ?? "/", "http://127.0.0.1")
}

async function handleHealth(store: LearningDaemonStore, response: ServerResponse) {
  const state = await store.getState()
  const body: LearningDaemonHealthResponse = learningDaemonHealthResponseSchema.parse({
    ok: true,
    service: LEARNING_DAEMON_SERVICE,
    contractVersion: LEARNING_CONTRACT_VERSION,
    projectionVersion: state.projectionVersion,
    paired: false,
  })
  sendJson(response, 200, body)
}

async function handleProjection(store: LearningDaemonStore, response: ServerResponse) {
  const state = await store.getState()
  const body: MasteryProjectionResponse = masteryProjectionResponseSchema.parse({
    ok: true,
    projectionVersion: state.projectionVersion,
    eventId: state.eventId,
    entries: state.entries,
  })
  sendJson(response, 200, body)
}

async function handleProjectionTerms(
  store: LearningDaemonStore,
  url: URL,
  response: ServerResponse,
) {
  const terms = url.searchParams.getAll("terms")
    .flatMap(value => value.split(","))
    .map(term => term.trim())
    .filter(Boolean)
  const request = masteryProjectionTermsRequestSchema.parse({ terms })
  const normalizedTerms = new Set(request.terms.map(normalizeLearningDaemonText))
  const state = await store.getState()
  const body: MasteryProjectionResponse = masteryProjectionResponseSchema.parse({
    ok: true,
    projectionVersion: state.projectionVersion,
    eventId: state.eventId,
    entries: state.entries.filter(entry => normalizedTerms.has(entry.normalizedText)),
  })
  sendJson(response, 200, body)
}

async function handleCaptureSelection(
  request: IncomingMessage,
  response: ServerResponse,
  store: LearningDaemonStore,
  maxBodyBytes: number,
) {
  const capture: LearningCaptureSelectionRequest = learningCaptureSelectionRequestSchema.parse(
    await readJsonBody(request, maxBodyBytes),
  )
  const result = await store.captureSelection(capture)
  sendJson(response, 200, learningCaptureSelectionResponseSchema.parse({
    ok: true,
    itemIds: result.itemIds,
    projectionVersion: result.projectionVersion,
  }))
}

export function createLearningDaemonServer(options: LearningDaemonServerOptions) {
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  return createServer((request, response) => {
    setCorsHeaders(request, response, allowedOrigins)

    void (async () => {
      if (request.method === "OPTIONS") {
        response.statusCode = 204
        response.end()
        return
      }

      const url = getRequestUrl(request)
      const path = url.pathname

      if (request.method === "GET" && path === "/api/v1/health") {
        await handleHealth(options.store, response)
        return
      }

      if (request.method === "GET" && path === "/api/v1/projection") {
        await handleProjection(options.store, response)
        return
      }

      if (request.method === "GET" && path === "/api/v1/projection/terms") {
        await handleProjectionTerms(options.store, url, response)
        return
      }

      if (request.method === "POST" && path === "/api/v1/capture/selection") {
        await handleCaptureSelection(request, response, options.store, maxBodyBytes)
        return
      }

      sendError(response, 404, "Not found")
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      sendError(response, 400, message)
    })
  })
}
