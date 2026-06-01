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

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expectedType: string,
) {
  const decoder = new TextDecoder()
  let buffer = ""
  const deadline = Date.now() + 3_000

  while (Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for SSE event")), 250)
      }),
    ])
    if (result.done) {
      break
    }

    buffer += decoder.decode(result.value, { stream: true })
    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() ?? ""

    for (const chunk of chunks) {
      const eventType = /^event: (.+)$/m.exec(chunk)?.[1]
      const data = /^data: (.+)$/m.exec(chunk)?.[1]
      if (eventType === expectedType && data) {
        return JSON.parse(data) as unknown
      }
    }
  }

  throw new Error(`Expected SSE event ${expectedType}`)
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
    const html = await response.text()
    expect(html).toContain("data-readfrog-learning-workspace")
    expect(html).toContain("/workspace/app.css")
    expect(html).toContain("/workspace/app.js")
    expect(html).toContain("dictionary-select")
    expect(html).toContain("chapter-word-strip")
    expect(html).toContain("本地容器里的阅读记忆与 qwerty 练习中枢")
    expect(html).toContain("掌握度投影")
    expect(html).toContain("数据导入导出")
    expect(html).toContain("typing-ghost")
    expect(html).toContain("download-export-button")
  })

  it("serves workspace static assets without exposing arbitrary files", async () => {
    const [cssResponse, jsResponse, missingResponse] = await Promise.all([
      fetch(`${baseUrl}/workspace/app.css`),
      fetch(`${baseUrl}/workspace/app.js`),
      fetch(`${baseUrl}/workspace/../src/server.ts`),
    ])

    expect(cssResponse.status).toBe(200)
    expect(cssResponse.headers.get("content-type")).toContain("text/css")
    const css = await cssResponse.text()
    expect(css).toContain(".workspace")
    expect(css).toContain(".overview-panel")
    expect(css).toContain(".typing-ghost")
    expect(css).toContain(".segmented")
    expect(css).toContain("@media (max-width: 760px)")

    expect(jsResponse.status).toBe(200)
    expect(jsResponse.headers.get("content-type")).toContain("text/javascript")
    const js = await jsResponse.text()
    expect(js).toContain("/api/v1/workspace/state")
    expect(js).toContain("/api/v1/qwerty/dictionaries/")
    expect(js).toContain("async function postJson(path, body)")
    expect(js).toContain("if (!response.ok)")
    expect(js).toContain("await postJson(\"/api/v1/qwerty/records/word\"")
    expect(js).toContain("await postJson(\"/api/v1/qwerty/records/chapter\"")
    expect(js).toContain("getJson(\"/api/v1/export\")")
    expect(js).toContain("await postJson(\"/api/v1/import\"")
    expect(js).toContain("function renderTypingGhost()")
    expect(js).toContain("state.session.recordedChapterKeys = state.session.recordedChapterKeys.filter")

    expect(missingResponse.status).toBe(404)
  })

  it("streams daemon events after projection changes", async () => {
    const eventsResponse = await fetch(`${baseUrl}/api/v1/events`)
    expect(eventsResponse.status).toBe(200)
    expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream")

    const reader = eventsResponse.body?.getReader()
    if (!reader) {
      throw new Error("Expected an SSE response body")
    }

    try {
      await fetch(`${baseUrl}/api/v1/capture/selection`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Blob([JSON.stringify({
          id: "capture-event",
          text: "repeatable workflow",
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

      await expect(readSseEvent(reader, "projection.updated")).resolves.toMatchObject({
        type: "projection.updated",
        eventId: "event-1",
        projectionVersion: "projection-1",
        changedTerms: ["repeatable workflow", "workflow"],
      })
    }
    finally {
      await reader.cancel()
    }
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
        qwertyChapterRecordCount: 0,
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

  it("exports daemon-owned learning data for backup and extension migration", async () => {
    await fetch(`${baseUrl}/api/v1/capture/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "capture-export",
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
        id: "record-export",
        word: "workflow",
        input: "workflow",
        correct: true,
        accuracy: 1,
        durationMs: 1200,
        dictId: "cet4",
        chapterIndex: 0,
        wordIndex: 1,
        definition: "workflow definition",
        mistakes: [],
        createdAt: "2026-06-01T00:01:00.000Z",
      })]),
    })
    await fetch(`${baseUrl}/api/v1/qwerty/records/chapter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "chapter-export",
        dictId: "cet4",
        dictName: "CET-4",
        chapterIndex: 0,
        durationMs: 30_000,
        wordCount: 20,
        correctCount: 19,
        wrongCount: 1,
        accuracy: 0.95,
        correctWordIndexes: [0, 1],
        createdAt: "2026-06-01T00:02:00.000Z",
      })]),
    })

    const response = await fetch(`${baseUrl}/api/v1/export`)

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      format: "read-frog-learning-daemon-v1",
      contractVersion: LEARNING_CONTRACT_VERSION,
      projectionVersion: "projection-3",
      eventId: "event-3",
      stats: {
        captureCount: 1,
        qwertyRecordCount: 1,
        qwertyChapterRecordCount: 1,
        projectionEntryCount: 2,
      },
      state: {
        captures: [
          {
            id: "capture-export",
            text: "repeatable workflow",
          },
        ],
        qwertyWordRecords: [
          {
            id: "record-export",
            word: "workflow",
            definition: "workflow definition",
          },
        ],
        qwertyChapterRecords: [
          {
            id: "chapter-export",
            dictId: "cet4",
          },
        ],
        legacyReviewLogs: [],
        legacyReviewSessions: [],
        entries: expect.arrayContaining([
          expect.objectContaining({
            normalizedText: "workflow",
            status: "review",
          }),
        ]),
      },
    })
  })

  it("imports learning data idempotently and rebuilds the mastery projection", async () => {
    const payload = {
      format: "read-frog-learning-daemon-v1",
      state: {
        captures: [
          {
            id: "capture-import",
            text: "repeatable workflow",
            context: "A repeatable workflow helps teams improve.",
            createdAt: "2026-06-01T00:00:00.000Z",
            extractedItems: [
              {
                text: "workflow",
                kind: "word",
                explanation: { meaningZh: "workflow definition" },
              },
            ],
          },
        ],
        qwertyWordRecords: [
          {
            id: "record-import",
            word: "ability",
            input: "ability",
            correct: true,
            accuracy: 1,
            durationMs: 1100,
            definition: "ability definition",
            mistakes: [],
            createdAt: "2026-06-01T00:01:00.000Z",
          },
        ],
        qwertyChapterRecords: [
          {
            id: "chapter-import",
            dictId: "cet4",
            dictName: "CET-4",
            chapterIndex: 2,
            durationMs: 40_000,
            wordCount: 20,
            correctCount: 18,
            wrongCount: 2,
            accuracy: 0.9,
            correctWordIndexes: [40, 41],
            createdAt: "2026-06-01T00:02:00.000Z",
          },
        ],
        legacyReviewLogs: [
          {
            id: "review-log-import",
            itemId: "capture-import",
            rating: "good",
            reviewedAt: "2026-06-01T00:03:00.000Z",
            createdAt: "2026-06-01T00:03:00.000Z",
            updatedAt: "2026-06-01T00:03:00.000Z",
          },
        ],
        legacyReviewSessions: [
          {
            id: "review-session-import",
            itemIds: ["capture-import"],
            createdAt: "2026-06-01T00:04:00.000Z",
            updatedAt: "2026-06-01T00:04:00.000Z",
          },
        ],
        entries: [],
      },
    }

    const firstImportResponse = await fetch(`${baseUrl}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify(payload)]),
    })
    await expect(firstImportResponse.json()).resolves.toMatchObject({
      ok: true,
      changed: true,
      projectionVersion: "projection-1",
      eventId: "event-1",
      imported: {
        captures: 1,
        qwertyWordRecords: 1,
        qwertyChapterRecords: 1,
        projectionEntries: 3,
        legacyReviewLogs: 1,
        legacyReviewSessions: 1,
      },
      skipped: {
        captures: 0,
        qwertyWordRecords: 0,
        qwertyChapterRecords: 0,
        legacyReviewLogs: 0,
        legacyReviewSessions: 0,
      },
    })

    const secondImportResponse = await fetch(`${baseUrl}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify(payload)]),
    })
    await expect(secondImportResponse.json()).resolves.toMatchObject({
      ok: true,
      changed: false,
      projectionVersion: "projection-1",
      eventId: "event-1",
      imported: {
        captures: 0,
        qwertyWordRecords: 0,
        qwertyChapterRecords: 0,
        projectionEntries: 0,
        legacyReviewLogs: 0,
        legacyReviewSessions: 0,
      },
      skipped: {
        captures: 1,
        qwertyWordRecords: 1,
        qwertyChapterRecords: 1,
        legacyReviewLogs: 1,
        legacyReviewSessions: 1,
      },
    })

    const workspaceResponse = await fetch(`${baseUrl}/api/v1/workspace/state`)
    await expect(workspaceResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-1",
      stats: {
        captureCount: 1,
        qwertyRecordCount: 1,
        qwertyChapterRecordCount: 1,
        projectionEntryCount: 3,
      },
      captures: [{ id: "capture-import" }],
      qwertyWordRecords: [{ id: "record-import", word: "ability" }],
      qwertyChapterRecords: [{ id: "chapter-import", dictId: "cet4", chapterIndex: 2 }],
    })

    const projectionResponse = await fetch(`${baseUrl}/api/v1/projection/terms?terms=repeatable%20workflow,workflow,ability`)
    await expect(projectionResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-1",
      entries: expect.arrayContaining([
        expect.objectContaining({
          normalizedText: "repeatable workflow",
          kind: "phrase",
          status: "learning",
        }),
        expect.objectContaining({
          normalizedText: "workflow",
          kind: "word",
          definition: "workflow definition",
        }),
        expect.objectContaining({
          normalizedText: "ability",
          kind: "word",
          status: "review",
          definition: "ability definition",
        }),
      ]),
    })
  })

  it("imports newer records over existing records with the same stable id", async () => {
    await fetch(`${baseUrl}/api/v1/capture/selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "capture-upsert",
        text: "old workflow",
        createdAt: "2026-06-01T00:00:00.000Z",
        explanation: { meaningZh: "old definition" },
        extractedItems: [],
      })]),
    })

    const response = await fetch(`${baseUrl}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        captures: [
          {
            id: "capture-upsert",
            text: "new workflow",
            createdAt: "2026-06-01T00:10:00.000Z",
            explanation: { meaningZh: "new definition" },
            extractedItems: [],
          },
        ],
        qwertyWordRecords: [],
        qwertyChapterRecords: [],
        entries: [],
      })]),
    })

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      changed: true,
      imported: {
        captures: 1,
      },
      skipped: {
        captures: 0,
      },
    })

    const exportResponse = await fetch(`${baseUrl}/api/v1/export`)
    await expect(exportResponse.json()).resolves.toMatchObject({
      state: {
        captures: [
          {
            id: "capture-upsert",
            text: "new workflow",
            createdAt: "2026-06-01T00:10:00.000Z",
          },
        ],
      },
    })
  })

  it("serializes concurrent daemon writes so bridge and workspace updates do not overwrite each other", async () => {
    await Promise.all([
      fetch(`${baseUrl}/api/v1/capture/selection`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Blob([JSON.stringify({
          id: "capture-concurrent",
          text: "repeatable workflow",
          context: "A repeatable workflow helps teams improve.",
          createdAt: "2026-06-01T00:00:00.000Z",
          extractedItems: [
            {
              text: "workflow",
              kind: "word",
              explanation: { meaningZh: "workflow definition" },
            },
          ],
        })]),
      }),
      fetch(`${baseUrl}/api/v1/qwerty/records/word`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Blob([JSON.stringify({
          id: "record-concurrent",
          word: "ability",
          input: "ability",
          correct: true,
          accuracy: 1,
          durationMs: 1100,
          definition: "ability definition",
          mistakes: [],
          createdAt: "2026-06-01T00:01:00.000Z",
        })]),
      }),
      fetch(`${baseUrl}/api/v1/qwerty/records/chapter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Blob([JSON.stringify({
          id: "chapter-concurrent",
          dictId: "cet4",
          dictName: "CET-4",
          chapterIndex: 1,
          durationMs: 45_000,
          wordCount: 20,
          correctCount: 19,
          wrongCount: 1,
          accuracy: 0.95,
          correctWordIndexes: [20, 21],
          createdAt: "2026-06-01T00:02:00.000Z",
        })]),
      }),
    ])

    const workspaceResponse = await fetch(`${baseUrl}/api/v1/workspace/state`)
    await expect(workspaceResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-3",
      stats: {
        captureCount: 1,
        qwertyRecordCount: 1,
        qwertyChapterRecordCount: 1,
        projectionEntryCount: 3,
      },
      captures: [
        {
          id: "capture-concurrent",
        },
      ],
      qwertyWordRecords: [
        {
          id: "record-concurrent",
          word: "ability",
        },
      ],
      qwertyChapterRecords: [
        {
          id: "chapter-concurrent",
          dictId: "cet4",
          chapterIndex: 1,
        },
      ],
    })

    const projectionResponse = await fetch(`${baseUrl}/api/v1/projection/terms?terms=workflow,ability`)
    await expect(projectionResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-3",
      entries: expect.arrayContaining([
        expect.objectContaining({ normalizedText: "workflow" }),
        expect.objectContaining({ normalizedText: "ability" }),
      ]),
    })
  })

  it("records qwerty chapter practice and exposes chapter summaries", async () => {
    const chapterResponse = await fetch(`${baseUrl}/api/v1/qwerty/records/chapter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        id: "chapter-state",
        dictId: "cet4",
        dictName: "CET-4",
        chapterIndex: 0,
        durationMs: 30_000,
        wordCount: 20,
        correctCount: 18,
        wrongCount: 2,
        accuracy: 0.9,
        correctWordIndexes: [0, 1, 2],
        createdAt: "2026-06-01T00:02:00.000Z",
      })]),
    })

    await expect(chapterResponse.json()).resolves.toEqual({
      ok: true,
      recordId: "chapter-state",
      projectionVersion: "projection-1",
    })

    const workspaceResponse = await fetch(`${baseUrl}/api/v1/workspace/state`)
    await expect(workspaceResponse.json()).resolves.toMatchObject({
      ok: true,
      projectionVersion: "projection-1",
      stats: {
        qwertyChapterRecordCount: 1,
      },
      qwertyChapterRecords: [
        {
          id: "chapter-state",
          dictId: "cet4",
          dictName: "CET-4",
          chapterIndex: 0,
          durationMs: 30_000,
          wordCount: 20,
          correctCount: 18,
          wrongCount: 2,
          accuracy: 0.9,
          createdAt: "2026-06-01T00:02:00.000Z",
        },
      ],
    })
  })

  it("aggregates qwerty mistake words and key pairs for the workspace error book", async () => {
    await fetch(`${baseUrl}/api/v1/qwerty/records/word`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([JSON.stringify({
        word: "workflow",
        input: "workflou",
        correct: false,
        accuracy: 0.875,
        durationMs: 1600,
        dictId: "cet4",
        chapterIndex: 0,
        wordIndex: 7,
        mistakes: [
          { expected: "w", actual: "u", index: 7 },
        ],
        createdAt: "2026-06-01T00:03:00.000Z",
      })]),
    })

    const response = await fetch(`${baseUrl}/api/v1/workspace/state`)

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      qwertyMistakes: {
        words: [
          {
            word: "workflow",
            count: 1,
            lastInput: "workflou",
            lastAccuracy: 0.875,
            lastPracticedAt: "2026-06-01T00:03:00.000Z",
          },
        ],
        keys: [
          {
            expected: "w",
            actual: "u",
            count: 1,
          },
        ],
      },
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
