import type {
  LearningCaptureSelectionRequest,
  LearningQwertyChapterRecordRequest,
  LearningQwertyWordRecordRequest,
  LearningWorkspaceQwertyMistakesSummary,
  LearningWorkspaceStateResponse,
  LearningWorkspaceStats,
  MasteryProjectionEntry,
} from "../../../src/utils/learning-contracts/schemas.ts"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export interface LearningDaemonStoreState {
  sequence: number
  projectionVersion: string
  eventId?: string
  captures: LearningCaptureSelectionRequest[]
  qwertyWordRecords: LearningQwertyWordRecordRequest[]
  qwertyChapterRecords: LearningQwertyChapterRecordRequest[]
  entries: MasteryProjectionEntry[]
}

export interface CaptureSelectionResult {
  itemIds: string[]
  projectionVersion: string
  eventId: string
  changedTerms: string[]
}

export interface RecordQwertyWordResult {
  itemId: string
  projectionVersion: string
  eventId: string
  changedTerms: string[]
  entry: MasteryProjectionEntry
}

export interface RecordQwertyChapterResult {
  recordId: string
  projectionVersion: string
  eventId: string
}

export interface LearningDaemonStore {
  getState: () => Promise<LearningDaemonStoreState>
  getWorkspaceState: () => Promise<LearningWorkspaceStateResponse>
  captureSelection: (capture: LearningCaptureSelectionRequest) => Promise<CaptureSelectionResult>
  recordQwertyWord: (record: LearningQwertyWordRecordRequest) => Promise<RecordQwertyWordResult>
  recordQwertyChapter: (record: LearningQwertyChapterRecordRequest) => Promise<RecordQwertyChapterResult>
}

export function normalizeLearningDaemonText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/^["'([{]+|["'\])}.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
}

function createInitialState(): LearningDaemonStoreState {
  return {
    sequence: 0,
    projectionVersion: "projection-0",
    captures: [],
    qwertyWordRecords: [],
    qwertyChapterRecords: [],
    entries: [],
  }
}

function getStatePath(dataDir: string) {
  return join(dataDir, "learning-daemon-state.json")
}

async function readState(filePath: string): Promise<LearningDaemonStoreState> {
  try {
    return {
      ...createInitialState(),
      ...JSON.parse(await readFile(filePath, "utf8")),
    }
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return createInitialState()
    }
    throw error
  }
}

async function writeState(filePath: string, state: LearningDaemonStoreState): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(tempPath, filePath)
}

function upsertProjectionEntry(
  entries: MasteryProjectionEntry[],
  entry: MasteryProjectionEntry,
): MasteryProjectionEntry[] {
  const next = entries.filter(existing =>
    existing.normalizedText !== entry.normalizedText || existing.kind !== entry.kind,
  )
  next.push(entry)
  return next.sort((a, b) => a.normalizedText.localeCompare(b.normalizedText))
}

function createProjectionEntry(input: {
  text: string
  kind: MasteryProjectionEntry["kind"]
  definition?: string
  status?: MasteryProjectionEntry["status"]
  confidence?: number
  updatedAt: string
}): MasteryProjectionEntry | undefined {
  const normalizedText = normalizeLearningDaemonText(input.text)
  if (!normalizedText) {
    return undefined
  }

  return {
    normalizedText,
    kind: input.kind,
    status: input.status ?? "learning",
    confidence: input.confidence ?? 0.35,
    definition: input.definition,
    updatedAt: input.updatedAt,
  }
}

function projectionEntriesFromCapture(capture: LearningCaptureSelectionRequest): MasteryProjectionEntry[] {
  const entries: MasteryProjectionEntry[] = []
  const parent = createProjectionEntry({
    text: capture.text,
    kind: "phrase",
    definition: capture.explanation?.meaningZh,
    updatedAt: capture.createdAt,
  })
  if (parent) {
    entries.push(parent)
  }

  for (const item of capture.extractedItems) {
    const entry = createProjectionEntry({
      text: item.text,
      kind: item.kind,
      definition: item.explanation?.meaningZh,
      updatedAt: capture.createdAt,
    })
    if (entry) {
      entries.push(entry)
    }
  }

  return entries
}

function createProjectionEntryFromQwertyRecord(
  record: LearningQwertyWordRecordRequest,
  previousEntry: MasteryProjectionEntry | undefined,
  recentRecords: LearningQwertyWordRecordRequest[],
): MasteryProjectionEntry | undefined {
  const accuracyConfidence = Math.max(0.05, Math.min(0.95, record.accuracy))
  const previousConfidence = previousEntry?.confidence ?? 0.2
  const correctStreak = getRecentCorrectQwertyStreak(record.word, recentRecords)
  const confidence = record.correct
    ? Math.min(0.99, Math.max(0.55, previousConfidence + 0.18, accuracyConfidence))
    : Math.max(0.05, Math.min(0.45, previousConfidence - 0.25, accuracyConfidence))
  const status = record.correct && record.accuracy >= 0.92 && correctStreak >= 3
    ? "mature"
    : record.correct && record.accuracy >= 0.92 ? "review" : "learning"
  return createProjectionEntry({
    text: record.word,
    kind: "word",
    definition: record.definition,
    status,
    confidence,
    updatedAt: record.createdAt ?? new Date().toISOString(),
  })
}

function getRecentCorrectQwertyStreak(
  word: string,
  records: LearningQwertyWordRecordRequest[],
) {
  const normalizedWord = normalizeLearningDaemonText(word)
  let streak = 0
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!
    if (normalizeLearningDaemonText(record.word) !== normalizedWord) {
      continue
    }
    if (!record.correct || record.accuracy < 0.92) {
      break
    }
    streak += 1
  }
  return streak
}

function createWorkspaceStats(state: LearningDaemonStoreState): LearningWorkspaceStats {
  const projectionCounts = state.entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1
    return counts
  }, {})
  const accuracyTotal = state.qwertyWordRecords.reduce(
    (total, record) => total + record.accuracy,
    0,
  )
  const durationTotal = state.qwertyWordRecords.reduce(
    (total, record) => total + record.durationMs,
    0,
  )

  return {
    captureCount: state.captures.length,
    qwertyRecordCount: state.qwertyWordRecords.length,
    qwertyChapterRecordCount: state.qwertyChapterRecords.length,
    correctQwertyRecordCount: state.qwertyWordRecords.filter(record => record.correct).length,
    projectionEntryCount: state.entries.length,
    unknownCount: projectionCounts.unknown ?? 0,
    learningCount: projectionCounts.learning ?? 0,
    reviewCount: projectionCounts.review ?? 0,
    matureCount: projectionCounts.mature ?? 0,
    archivedCount: projectionCounts.archived ?? 0,
    averageAccuracy: state.qwertyWordRecords.length
      ? accuracyTotal / state.qwertyWordRecords.length
      : 0,
    averageDurationMs: state.qwertyWordRecords.length
      ? Math.round(durationTotal / state.qwertyWordRecords.length)
      : 0,
  }
}

function createQwertyMistakeSummary(
  records: LearningQwertyWordRecordRequest[],
): LearningWorkspaceQwertyMistakesSummary {
  const words = new Map<string, {
    word: string
    count: number
    lastInput: string
    lastAccuracy: number
    lastPracticedAt: string
  }>()
  const keys = new Map<string, {
    expected: string
    actual: string
    count: number
  }>()

  for (const record of records) {
    const createdAt = record.createdAt ?? new Date().toISOString()
    if (record.mistakes.length > 0 || !record.correct) {
      const existing = words.get(record.word)
      words.set(record.word, {
        word: record.word,
        count: (existing?.count ?? 0) + 1,
        lastInput: record.input,
        lastAccuracy: record.accuracy,
        lastPracticedAt: createdAt,
      })
    }

    for (const mistake of record.mistakes) {
      const key = `${mistake.expected}\u0000${mistake.actual}`
      const existing = keys.get(key)
      keys.set(key, {
        expected: mistake.expected,
        actual: mistake.actual,
        count: (existing?.count ?? 0) + 1,
      })
    }
  }

  return {
    words: [...words.values()]
      .sort((a, b) => b.count - a.count || b.lastPracticedAt.localeCompare(a.lastPracticedAt))
      .slice(0, 12),
    keys: [...keys.values()]
      .sort((a, b) => b.count - a.count || a.expected.localeCompare(b.expected) || a.actual.localeCompare(b.actual))
      .slice(0, 10),
  }
}

function createWorkspaceStateResponse(
  state: LearningDaemonStoreState,
): LearningWorkspaceStateResponse {
  return {
    ok: true,
    projectionVersion: state.projectionVersion,
    eventId: state.eventId,
    stats: createWorkspaceStats(state),
    captures: state.captures
      .slice(-50)
      .reverse()
      .map(capture => ({
        id: capture.id,
        text: capture.text,
        context: capture.context,
        sourceUrl: capture.sourceUrl,
        sourceTitle: capture.sourceTitle,
        extractedCount: capture.extractedItems.length,
        createdAt: capture.createdAt,
      })),
    qwertyWordRecords: state.qwertyWordRecords
      .slice(-80)
      .reverse()
      .map(record => ({
        id: record.id,
        word: record.word,
        input: record.input,
        correct: record.correct,
        accuracy: record.accuracy,
        durationMs: record.durationMs,
        dictId: record.dictId,
        dictName: record.dictName,
        chapterIndex: record.chapterIndex,
        wordIndex: record.wordIndex,
        mistakeCount: record.mistakes.length,
        createdAt: record.createdAt ?? new Date().toISOString(),
      })),
    qwertyChapterRecords: state.qwertyChapterRecords
      .slice(-30)
      .reverse()
      .map(record => ({
        id: record.id,
        dictId: record.dictId,
        dictName: record.dictName,
        chapterIndex: record.chapterIndex,
        durationMs: record.durationMs,
        wordCount: record.wordCount,
        correctCount: record.correctCount,
        wrongCount: record.wrongCount,
        accuracy: record.accuracy,
        createdAt: record.createdAt ?? new Date().toISOString(),
      })),
    qwertyMistakes: createQwertyMistakeSummary(state.qwertyWordRecords),
  }
}

export function createFileLearningDaemonStore(dataDir: string): LearningDaemonStore {
  const filePath = getStatePath(dataDir)

  return {
    async getState() {
      return await readState(filePath)
    },

    async getWorkspaceState() {
      return createWorkspaceStateResponse(await readState(filePath))
    },

    async captureSelection(capture) {
      const state = await readState(filePath)
      const sequence = state.sequence + 1
      const projectionVersion = `projection-${sequence}`
      const eventId = `event-${sequence}`
      const entries = projectionEntriesFromCapture(capture).reduce(
        (currentEntries, entry) => upsertProjectionEntry(currentEntries, entry),
        state.entries,
      )
      const itemIds = [
        capture.id,
        ...capture.extractedItems.map((_, index) => `${capture.id}:child:${index}`),
      ]

      await writeState(filePath, {
        ...state,
        sequence,
        projectionVersion,
        eventId,
        captures: [...state.captures, capture],
        entries,
      })

      return {
        itemIds,
        projectionVersion,
        eventId,
        changedTerms: projectionEntriesFromCapture(capture).map(entry => entry.normalizedText),
      }
    },

    async recordQwertyWord(record) {
      const state = await readState(filePath)
      const sequence = state.sequence + 1
      const projectionVersion = `projection-${sequence}`
      const eventId = `event-${sequence}`
      const createdAt = record.createdAt ?? new Date().toISOString()
      const recordWithCreatedAt = {
        ...record,
        createdAt,
      }
      const previousEntry = state.entries.find(existing =>
        existing.kind === "word"
        && existing.normalizedText === normalizeLearningDaemonText(recordWithCreatedAt.word),
      )
      const recordsForStreak = [...state.qwertyWordRecords, recordWithCreatedAt]
      const entry = createProjectionEntryFromQwertyRecord(
        recordWithCreatedAt,
        previousEntry,
        recordsForStreak,
      )
      if (!entry) {
        throw new Error("Qwerty word record text is empty")
      }
      const entries = upsertProjectionEntry(state.entries, entry)
      const itemId = record.id ?? `${entry.normalizedText}:qwerty:${sequence}`

      await writeState(filePath, {
        ...state,
        sequence,
        projectionVersion,
        eventId,
        qwertyWordRecords: [...state.qwertyWordRecords, recordWithCreatedAt],
        entries,
      })

      return {
        itemId,
        projectionVersion,
        eventId,
        changedTerms: [entry.normalizedText],
        entry,
      }
    },

    async recordQwertyChapter(record) {
      const state = await readState(filePath)
      const sequence = state.sequence + 1
      const projectionVersion = `projection-${sequence}`
      const eventId = `event-${sequence}`
      const createdAt = record.createdAt ?? new Date().toISOString()
      const recordId = record.id ?? `${record.dictId}:chapter:${record.chapterIndex}:${sequence}`
      const recordWithCreatedAt = {
        ...record,
        id: recordId,
        createdAt,
      }

      await writeState(filePath, {
        ...state,
        sequence,
        projectionVersion,
        eventId,
        qwertyChapterRecords: [...state.qwertyChapterRecords, recordWithCreatedAt],
      })

      return { recordId, projectionVersion, eventId }
    },
  }
}
