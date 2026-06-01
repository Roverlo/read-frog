import type {
  LearningQwertyDictionaryResource,
  LearningQwertyWord,
} from "../../../src/utils/learning-contracts/schemas.ts"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const QWERTY_DAEMON_CHAPTER_LENGTH = 20

interface QwertyDictionaryFileResource {
  id: string
  fileName: string
  name: string
  description: string
  category: string
  tags: string[]
  length: number
  language: "en"
}

const QWERTY_DICTIONARY_FILES: QwertyDictionaryFileResource[] = [
  {
    id: "cet4",
    fileName: "CET4_T.json",
    name: "CET-4",
    description: "College English Test Band 4 core vocabulary",
    category: "Chinese exams",
    tags: ["college english", "CET-4"],
    length: 2607,
    language: "en",
  },
  {
    id: "cet6",
    fileName: "CET6_T.json",
    name: "CET-6",
    description: "College English Test Band 6 core vocabulary",
    category: "Chinese exams",
    tags: ["college english", "CET-6"],
    length: 2345,
    language: "en",
  },
  {
    id: "toefl",
    fileName: "TOEFL_3_T.json",
    name: "TOEFL",
    description: "High-frequency TOEFL vocabulary",
    category: "International exams",
    tags: ["TOEFL"],
    length: 4264,
    language: "en",
  },
  {
    id: "gre1500",
    fileName: "GRE_1500.json",
    name: "GRE 1500",
    description: "High-frequency GRE vocabulary",
    category: "International exams",
    tags: ["GRE"],
    length: 1533,
    language: "en",
  },
  {
    id: "oxford3000",
    fileName: "Oxford3000.json",
    name: "Oxford 3000",
    description: "Oxford 3000 high-frequency vocabulary slice",
    category: "English dictionaries",
    tags: ["high frequency", "foundation"],
    length: 1342,
    language: "en",
  },
  {
    id: "top2000",
    fileName: "top2000words.json",
    name: "Top 2000",
    description: "High-frequency English top 2000 vocabulary",
    category: "English dictionaries",
    tags: ["high frequency"],
    length: 1867,
    language: "en",
  },
]

const moduleDir = dirname(fileURLToPath(import.meta.url))
const dictionaryDir = join(moduleDir, "..", "dicts", "qwerty")

function toResource(dict: QwertyDictionaryFileResource): LearningQwertyDictionaryResource {
  return {
    id: dict.id,
    name: dict.name,
    description: dict.description,
    category: dict.category,
    tags: dict.tags,
    length: dict.length,
    chapterLength: QWERTY_DAEMON_CHAPTER_LENGTH,
    chapterCount: Math.max(1, Math.ceil(dict.length / QWERTY_DAEMON_CHAPTER_LENGTH)),
    language: dict.language,
  }
}

function normalizeTrans(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }
  if (typeof value === "string") {
    return [value]
  }
  return []
}

function normalizeQwertyWord(value: unknown, index: number): LearningQwertyWord | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const word = value as Record<string, unknown>
  if (typeof word.name !== "string" || !word.name.trim()) {
    return null
  }

  return {
    index,
    name: word.name.trim(),
    trans: normalizeTrans(word.trans),
    usphone: typeof word.usphone === "string" ? word.usphone : undefined,
    ukphone: typeof word.ukphone === "string" ? word.ukphone : undefined,
    notation: typeof word.notation === "string" ? word.notation : undefined,
  }
}

function getDictionaryFileResource(idOrFileName: string) {
  return QWERTY_DICTIONARY_FILES.find(dict =>
    dict.id === idOrFileName || dict.fileName === idOrFileName,
  )
}

export function getQwertyDictionaryResources() {
  return QWERTY_DICTIONARY_FILES.map(toResource)
}

export function getQwertyDictionaryResource(id: string) {
  const dict = getDictionaryFileResource(id)
  return dict ? toResource(dict) : undefined
}

export async function readQwertyDictionaryRawJson(idOrFileName: string) {
  const dict = getDictionaryFileResource(idOrFileName)
  if (!dict) {
    return undefined
  }
  return await readFile(join(dictionaryDir, dict.fileName), "utf8")
}

export async function loadQwertyDictionaryWords(id: string) {
  const rawJson = await readQwertyDictionaryRawJson(id)
  if (rawJson === undefined) {
    return undefined
  }
  const rawWords = JSON.parse(rawJson) as unknown
  if (!Array.isArray(rawWords)) {
    return []
  }
  return rawWords
    .map(normalizeQwertyWord)
    .filter((word): word is LearningQwertyWord => word !== null)
}

export async function getQwertyDictionaryChapter(id: string, chapterIndex: number) {
  const dictionary = getQwertyDictionaryResource(id)
  if (!dictionary) {
    return undefined
  }
  const words = await loadQwertyDictionaryWords(id)
  if (!words) {
    return undefined
  }
  const safeChapterIndex = Math.max(0, Math.floor(chapterIndex))
  const start = safeChapterIndex * dictionary.chapterLength
  return {
    dictionary,
    chapterIndex: safeChapterIndex,
    words: words.slice(start, start + dictionary.chapterLength),
  }
}
