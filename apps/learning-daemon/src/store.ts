import type {
  LearningCaptureSelectionRequest,
  LearningDaemonImportSummary,
  LearningDaemonPortableState,
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

export interface ImportLearningDataResult {
  changed: boolean
  projectionVersion: string
  eventId?: string
  changedTerms: string[]
  imported: LearningDaemonImportSummary
  skipped: LearningDaemonImportSummary
}

export interface LearningDaemonStore {
  getState: () => Promise<LearningDaemonStoreState>
  getWorkspaceState: () => Promise<LearningWorkspaceStateResponse>
  captureSelection: (capture: LearningCaptureSelectionRequest) => Promise<CaptureSelectionResult>
  recordQwertyWord: (record: LearningQwertyWordRecordRequest) => Promise<RecordQwertyWordResult>
  recordQwertyChapter: (record: LearningQwertyChapterRecordRequest) => Promise<RecordQwertyChapterResult>
  importLearningData: (data: LearningDaemonPortableState) => Promise<ImportLearningDataResult>
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

function getProjectionEntryKey(entry: Pick<MasteryProjectionEntry, "kind" | "normalizedText">) {
  return `${entry.kind}\u0000${entry.normalizedText}`
}

function isIncomingTimestampNewer(existingTimestamp: string | undefined, incomingTimestamp: string | undefined) {
  if (!existingTimestamp) {
    return Boolean(incomingTimestamp)
  }
  if (!incomingTimestamp) {
    return false
  }
  return incomingTimestamp > existingTimestamp
}

function getQwertyWordRecordKey(record: LearningQwertyWordRecordRequest) {
  if (record.id) {
    return `id:${record.id}`
  }

  return [
    "word",
    normalizeLearningDaemonText(record.word),
    record.createdAt ?? "",
    record.dictId ?? "",
    record.chapterIndex ?? "",
    record.wordIndex ?? "",
    record.input,
    record.durationMs,
  ].join("\u0000")
}

function getQwertyChapterRecordKey(record: LearningQwertyChapterRecordRequest) {
  if (record.id) {
    return `id:${record.id}`
  }

  return [
    "chapter",
    record.dictId,
    record.chapterIndex,
    record.createdAt ?? "",
    record.durationMs,
    record.wordCount,
    record.correctCount,
    record.wrongCount,
  ].join("\u0000")
}

function mergeByKey<T>(
  existingItems: T[],
  incomingItems: T[],
  options: {
    getKey: (item: T) => string
    getTimestamp?: (item: T) => string | undefined
    sortTimestamp?: (item: T) => string | undefined
  },
) {
  const byKey = new Map(existingItems.map(item => [options.getKey(item), item]))
  let imported = 0
  let skipped = 0

  for (const incoming of incomingItems) {
    const key = options.getKey(incoming)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, incoming)
      imported += 1
      continue
    }

    if (
      options.getTimestamp
      && isIncomingTimestampNewer(options.getTimestamp(existing), options.getTimestamp(incoming))
    ) {
      byKey.set(key, incoming)
      imported += 1
      continue
    }

    skipped += 1
  }

  const items = [...byKey.values()]
  if (options.sortTimestamp) {
    items.sort((a, b) => {
      const aTimestamp = options.sortTimestamp?.(a) ?? ""
      const bTimestamp = options.sortTimestamp?.(b) ?? ""
      return aTimestamp.localeCompare(bTimestamp)
    })
  }

  return { items, imported, skipped }
}

function mergeProjectionEntries(
  existingItems: MasteryProjectionEntry[],
  incomingItems: MasteryProjectionEntry[],
) {
  return mergeByKey(existingItems, incomingItems, {
    getKey: getProjectionEntryKey,
    getTimestamp: entry => entry.updatedAt,
    sortTimestamp: entry => entry.normalizedText,
  })
}

function getChangedProjectionTerms(
  existingEntries: MasteryProjectionEntry[],
  nextEntries: MasteryProjectionEntry[],
) {
  const existingByKey = new Map(
    existingEntries.map(entry => [getProjectionEntryKey(entry), JSON.stringify(entry)]),
  )
  return nextEntries
    .filter(entry => existingByKey.get(getProjectionEntryKey(entry)) !== JSON.stringify(entry))
    .map(entry => entry.normalizedText)
    .sort((a, b) => a.localeCompare(b))
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

function createDerivedProjectionEntries(input: {
  captures: LearningCaptureSelectionRequest[]
  qwertyWordRecords: LearningQwertyWordRecordRequest[]
}) {
  let entries: MasteryProjectionEntry[] = []
  const captures = [...input.captures].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const capture of captures) {
    entries = projectionEntriesFromCapture(capture).reduce(
      (currentEntries, entry) => upsertProjectionEntry(currentEntries, entry),
      entries,
    )
  }

  const qwertyRecords = [...input.qwertyWordRecords].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  )
  const recordsForStreak: LearningQwertyWordRecordRequest[] = []
  for (const record of qwertyRecords) {
    recordsForStreak.push(record)
    const previousEntry = entries.find(existing =>
      existing.kind === "word"
      && existing.normalizedText === normalizeLearningDaemonText(record.word),
    )
    const entry = createProjectionEntryFromQwertyRecord(record, previousEntry, recordsForStreak)
    if (entry) {
      entries = upsertProjectionEntry(entries, entry)
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
  let mutationTail = Promise.resolve()

  async function readSettledState() {
    await mutationTail
    return await readState(filePath)
  }

  function enqueueMutation<T>(
    mutate: (state: LearningDaemonStoreState) => Promise<{
      nextState: LearningDaemonStoreState
      result: T
    }> | {
      nextState: LearningDaemonStoreState
      result: T
    },
  ): Promise<T> {
    const run = mutationTail.then(async () => {
      const state = await readState(filePath)
      const { nextState, result } = await mutate(state)
      await writeState(filePath, nextState)
      return result
    })
    mutationTail = run.then(() => undefined, () => undefined)
    return run
  }

  return {
    async getState() {
      return await readSettledState()
    },

    async getWorkspaceState() {
      return createWorkspaceStateResponse(await readSettledState())
    },

    async captureSelection(capture) {
      return await enqueueMutation((state) => {
        const sequence = state.sequence + 1
        const projectionVersion = `projection-${sequence}`
        const eventId = `event-${sequence}`
        const changedEntries = projectionEntriesFromCapture(capture)
        const entries = changedEntries.reduce(
          (currentEntries, entry) => upsertProjectionEntry(currentEntries, entry),
          state.entries,
        )
        const itemIds = [
          capture.id,
          ...capture.extractedItems.map((_, index) => `${capture.id}:child:${index}`),
        ]

        return {
          nextState: {
            ...state,
            sequence,
            projectionVersion,
            eventId,
            captures: [...state.captures, capture],
            entries,
          },
          result: {
            itemIds,
            projectionVersion,
            eventId,
            changedTerms: changedEntries.map(entry => entry.normalizedText),
          },
        }
      })
    },

    async recordQwertyWord(record) {
      return await enqueueMutation((state) => {
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

        return {
          nextState: {
            ...state,
            sequence,
            projectionVersion,
            eventId,
            qwertyWordRecords: [...state.qwertyWordRecords, recordWithCreatedAt],
            entries,
          },
          result: {
            itemId,
            projectionVersion,
            eventId,
            changedTerms: [entry.normalizedText],
            entry,
          },
        }
      })
    },

    async recordQwertyChapter(record) {
      return await enqueueMutation((state) => {
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

        return {
          nextState: {
            ...state,
            sequence,
            projectionVersion,
            eventId,
            qwertyChapterRecords: [...state.qwertyChapterRecords, recordWithCreatedAt],
          },
          result: { recordId, projectionVersion, eventId },
        }
      })
    },

    async importLearningData(data) {
      return await enqueueMutation((state) => {
        const captures = mergeByKey(state.captures, data.captures, {
          getKey: capture => capture.id,
          getTimestamp: capture => capture.createdAt,
          sortTimestamp: capture => capture.createdAt,
        })
        const qwertyWordRecords = mergeByKey(state.qwertyWordRecords, data.qwertyWordRecords, {
          getKey: getQwertyWordRecordKey,
          getTimestamp: record => record.createdAt,
          sortTimestamp: record => record.createdAt,
        })
        const qwertyChapterRecords = mergeByKey(state.qwertyChapterRecords, data.qwertyChapterRecords, {
          getKey: getQwertyChapterRecordKey,
          getTimestamp: record => record.createdAt,
          sortTimestamp: record => record.createdAt,
        })
        const explicitEntries = mergeProjectionEntries(state.entries, data.entries)
        const derivedEntries = createDerivedProjectionEntries({
          captures: captures.items,
          qwertyWordRecords: qwertyWordRecords.items,
        })
        const finalEntries = mergeProjectionEntries(derivedEntries, explicitEntries.items)
        const changedTerms = getChangedProjectionTerms(state.entries, finalEntries.items)
        const changed = captures.imported > 0
          || qwertyWordRecords.imported > 0
          || qwertyChapterRecords.imported > 0
          || changedTerms.length > 0
        const sequence = changed ? state.sequence + 1 : state.sequence
        const projectionVersion = changed ? `projection-${sequence}` : state.projectionVersion
        const eventId = changed ? `event-${sequence}` : state.eventId

        return {
          nextState: changed
            ? {
                ...state,
                sequence,
                projectionVersion,
                eventId,
                captures: captures.items,
                qwertyWordRecords: qwertyWordRecords.items,
                qwertyChapterRecords: qwertyChapterRecords.items,
                entries: finalEntries.items,
              }
            : state,
          result: {
            changed,
            projectionVersion,
            eventId,
            changedTerms,
            imported: {
              captures: captures.imported,
              qwertyWordRecords: qwertyWordRecords.imported,
              qwertyChapterRecords: qwertyChapterRecords.imported,
              projectionEntries: changedTerms.length,
            },
            skipped: {
              captures: captures.skipped,
              qwertyWordRecords: qwertyWordRecords.skipped,
              qwertyChapterRecords: qwertyChapterRecords.skipped,
              projectionEntries: explicitEntries.skipped,
            },
          },
        }
      })
    },
  }
}
