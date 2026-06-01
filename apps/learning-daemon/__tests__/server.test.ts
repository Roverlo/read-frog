import type { Server } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LEARNING_CONTRACT_VERSION, LEARNING_DAEMON_SERVICE } from "../../../src/utils/learning-contracts/schemas.ts"
import { createLearningDaemonServer } from "../src/server.ts"
import { createFileLearningDaemonStore } from "../src/store.ts"

async function listen(server: Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address !== "object") {
    throw new Error("Expected server address")
  }
  return `http://127.0.0.1:${address.port}`
}

describe("learning daemon server", () => {
  let dataDir: string
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "readfrog-learning-daemon-"))
    server = createLearningDaemonServer({
      store: createFileLearningDaemonStore(dataDir),
    })
    baseUrl = await listen(server)
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
        }
        else {
          resolve()
        }
      })
    })
    await rm(dataDir, { recursive: true, force: true })
  })

  it("serves health with the shared contract version", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`)

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: LEARNING_DAEMON_SERVICE,
      contractVersion: LEARNING_CONTRACT_VERSION,
      projectionVersion: "projection-0",
    })
  })

  it("serves the daemon-hosted learning workspace", async () => {
    const response = await fetch(`${baseUrl}/`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    await expect(response.text()).resolves.toContain("data-readfrog-learning-workspace")
  })

  it("stores selection captures and exposes a mastery projection", async () => {
    const captureResponse = await fetch(`${baseUrl}/api/v1/capture/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "capture-1",
        text: "repeatable workflow",
        context: "A repeatable workflow helps teams improve.",
        createdAt: "2026-06-01T00:00:00.000Z",
        explanation: { meaningZh: "可重复的工作流" },
        extractedItems: [
          {
            text: "workflow",
            kind: "word",
            explanation: { meaningZh: "工作流" },
            tags: ["source:selection"],
          },
        ],
      })]),
    })

    await expect(captureResponse.json()).resolves.toEqual({
      ok: true,
      itemIds: ["capture-1", "capture-1:child:0"],
      projectionVersion: "projection-1",
    })

    const projectionResponse = await fetch(`${baseUrl}/api/v1/projection`)
    await expect(projectionResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-1",
      eventId: "event-1",
      entries: [
        {
          normalizedText: "repeatable workflow",
          kind: "phrase",
          status: "learning",
          confidence: 0.35,
          definition: "可重复的工作流",
        },
        {
          normalizedText: "workflow",
          kind: "word",
          status: "learning",
          confidence: 0.35,
          definition: "工作流",
        },
      ],
    })
  })

  it("serves workspace state with capture, qwerty, and mastery stats", async () => {
    await fetch(`${baseUrl}/api/v1/capture/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "capture-state",
        text: "repeatable workflow",
        context: "A repeatable workflow helps teams improve.",
        sourceTitle: "Workflow notes",
        sourceUrl: "https://example.test/workflow",
        createdAt: "2026-06-01T00:00:00.000Z",
        extractedItems: [
          {
            text: "workflow",
            kind: "word",
            explanation: { meaningZh: "workflow definition" },
          },
        ],
      })]),
    })
    await fetch(`${baseUrl}/api/v1/qwerty/records/word`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "record-state",
        word: "workflow",
        input: "workflow",
        correct: true,
        accuracy: 1,
        durationMs: 1200,
        dictId: "cet4",
        chapterIndex: 0,
        wordIndex: 1,
        mistakes: [],
        createdAt: "2026-06-01T00:01:00.000Z",
      })]),
    })

    const response = await fetch(`${baseUrl}/api/v1/workspace/state`)

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-2",
      stats: {
        captureCount: 1,
        qwertyRecordCount: 1,
        correctQwertyRecordCount: 1,
        projectionEntryCount: 2,
        averageAccuracy: 1,
      },
      captures: [
        {
          id: "capture-state",
          text: "repeatable workflow",
          sourceTitle: "Workflow notes",
          sourceUrl: "https://example.test/workflow",
          extractedCount: 1,
        },
      ],
      qwertyWordRecords: [
        {
          id: "record-state",
          word: "workflow",
          input: "workflow",
          correct: true,
          accuracy: 1,
          durationMs: 1200,
          dictId: "cet4",
          chapterIndex: 0,
          wordIndex: 1,
          mistakeCount: 0,
        },
      ],
    })
  })

  it("serves qwerty dictionaries from the daemon asset directory", async () => {
    const dictionariesResponse = await fetch(`${baseUrl}/api/v1/qwerty/dictionaries`)

    const dictionariesBody = await dictionariesResponse.json()
    expect(dictionariesBody).toMatchObject({
      ok: true,
    })
    expect(dictionariesBody.dictionaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "cet4",
        name: "CET-4",
        chapterLength: 20,
        chapterCount: 131,
      }),
    ]))

    const chapterResponse = await fetch(`${baseUrl}/api/v1/qwerty/dictionaries/cet4/chapter/0`)
    const chapterBody = await chapterResponse.json()
    expect(chapterBody).toMatchObject({
      ok: true,
      dictionary: {
        id: "cet4",
      },
      chapterIndex: 0,
    })
    expect(chapterBody.words).toHaveLength(20)
    expect(chapterBody.words).toEqual(expect.arrayContaining([
      expect.objectContaining({
        index: 0,
        name: "cancel",
      }),
    ]))

    const rawResponse = await fetch(`${baseUrl}/dicts/qwerty/CET4_T.json`)
    expect(rawResponse.status).toBe(200)
    expect(rawResponse.headers.get("content-type")).toContain("application/json")
    await expect(rawResponse.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "cancel" }),
    ]))
  })

  it("records qwerty word practice and updates the mastery projection", async () => {
    const recordResponse = await fetch(`${baseUrl}/api/v1/qwerty/records/word`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        word: "workflow",
        input: "workflow",
        correct: true,
        accuracy: 1,
        durationMs: 1234,
        definition: "work process",
        createdAt: "2026-06-01T00:00:00.000Z",
      })]),
    })

    await expect(recordResponse.json()).resolves.toMatchObject({
      ok: true,
      itemId: "workflow:qwerty:1",
      projectionVersion: "projection-1",
      entry: {
        normalizedText: "workflow",
        kind: "word",
        status: "review",
        confidence: 0.95,
        definition: "work process",
      },
    })

    const projectionResponse = await fetch(`${baseUrl}/api/v1/projection`)
    await expect(projectionResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-1",
      eventId: "event-1",
      entries: [
        {
          normalizedText: "workflow",
          kind: "word",
          status: "review",
          confidence: 0.95,
          definition: "work process",
        },
      ],
    })
  })

  it("promotes repeated high-accuracy qwerty practice into mature projection terms", async () => {
    for (const createdAt of [
      "2026-06-01T00:00:00.000Z",
      "2026-06-01T00:01:00.000Z",
      "2026-06-01T00:02:00.000Z",
    ]) {
      await fetch(`${baseUrl}/api/v1/qwerty/records/word`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Blob([JSON.stringify({
          word: "workflow",
          input: "workflow",
          correct: true,
          accuracy: 1,
          durationMs: 1000,
          definition: "work process",
          createdAt,
        })]),
      })
    }

    const projectionResponse = await fetch(`${baseUrl}/api/v1/projection/terms?terms=workflow`)
    await expect(projectionResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-3",
      entries: [
        {
          normalizedText: "workflow",
          kind: "word",
          status: "mature",
          confidence: 0.99,
          definition: "work process",
        },
      ],
    })
  })

  it("filters mastery projection by requested terms", async () => {
    await fetch(`${baseUrl}/api/v1/capture/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "capture-terms",
        text: "repeatable workflow",
        createdAt: "2026-06-01T00:00:00.000Z",
        extractedItems: [
          {
            text: "workflow",
            kind: "word",
            explanation: { meaningZh: "工作流" },
          },
          {
            text: "ability",
            kind: "word",
            explanation: { meaningZh: "能力" },
          },
        ],
      })]),
    })

    const projectionResponse = await fetch(`${baseUrl}/api/v1/projection/terms?terms=workflow,missing`)
    await expect(projectionResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-1",
      entries: [
        {
          normalizedText: "workflow",
          kind: "word",
          status: "learning",
          definition: "工作流",
        },
      ],
    })
  })

  it("answers extension preflight requests with a matching CORS origin", async () => {
    const response = await fetch(`${baseUrl}/api/v1/capture/selection`, {
      method: "OPTIONS",
      headers: {
        "origin": "chrome-extension://extension-id",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("chrome-extension://extension-id")
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization")
  })
})
