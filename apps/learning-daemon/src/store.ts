import type {
  LearningCaptureSelectionRequest,
  MasteryProjectionEntry,
} from "../../../src/utils/learning-contracts/schemas.ts"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export interface LearningDaemonStoreState {
  sequence: number
  projectionVersion: string
  eventId?: string
  captures: LearningCaptureSelectionRequest[]
  entries: MasteryProjectionEntry[]
}

export interface CaptureSelectionResult {
  itemIds: string[]
  projectionVersion: string
}

export interface LearningDaemonStore {
  getState: () => Promise<LearningDaemonStoreState>
  captureSelection: (capture: LearningCaptureSelectionRequest) => Promise<CaptureSelectionResult>
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
  updatedAt: string
}): MasteryProjectionEntry | undefined {
  const normalizedText = normalizeLearningDaemonText(input.text)
  if (!normalizedText) {
    return undefined
  }

  return {
    normalizedText,
    kind: input.kind,
    status: "learning",
    confidence: 0.35,
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

export function createFileLearningDaemonStore(dataDir: string): LearningDaemonStore {
  const filePath = getStatePath(dataDir)

  return {
    async getState() {
      return await readState(filePath)
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

      return { itemIds, projectionVersion }
    },
  }
}
