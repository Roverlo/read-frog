import type {
  LearningQwertyDictionaryResource,
  LearningQwertyWord,
} from "@/utils/learning-contracts"
import {
  getLearningQwertyDictionaries,
  getLearningQwertyDictionaryChapter,
} from "@/utils/learning-bridge/daemon-client"
import { getLearningBridgeConfig } from "@/utils/learning-bridge/storage"

export type QwertyDictResource = LearningQwertyDictionaryResource
export type QwertyWord = Omit<LearningQwertyWord, "index">
export type QwertyWordWithIndex = LearningQwertyWord

export interface QwertyTypingMistake {
  expected: string
  actual: string
  index: number
}

export interface QwertyTypingResult {
  correct: boolean
  normalizedExpected: string
  normalizedInput: string
  mistakes: QwertyTypingMistake[]
  accuracy: number
}

export const QWERTY_CHAPTER_LENGTH = 20

export const QWERTY_DICT_RESOURCES_FALLBACK: QwertyDictResource[] = [
  {
    id: "cet4",
    name: "CET-4",
    description: "College English Test Band 4 core vocabulary",
    category: "Chinese exams",
    tags: ["college english", "CET-4"],
    length: 2607,
    chapterLength: QWERTY_CHAPTER_LENGTH,
    chapterCount: 131,
    language: "en",
  },
  {
    id: "cet6",
    name: "CET-6",
    description: "College English Test Band 6 core vocabulary",
    category: "Chinese exams",
    tags: ["college english", "CET-6"],
    length: 2345,
    chapterLength: QWERTY_CHAPTER_LENGTH,
    chapterCount: 118,
    language: "en",
  },
  {
    id: "toefl",
    name: "TOEFL",
    description: "High-frequency TOEFL vocabulary",
    category: "International exams",
    tags: ["TOEFL"],
    length: 4264,
    chapterLength: QWERTY_CHAPTER_LENGTH,
    chapterCount: 214,
    language: "en",
  },
  {
    id: "gre1500",
    name: "GRE 1500",
    description: "High-frequency GRE vocabulary",
    category: "International exams",
    tags: ["GRE"],
    length: 1533,
    chapterLength: QWERTY_CHAPTER_LENGTH,
    chapterCount: 77,
    language: "en",
  },
  {
    id: "oxford3000",
    name: "Oxford 3000",
    description: "Oxford 3000 high-frequency vocabulary slice",
    category: "English dictionaries",
    tags: ["high frequency", "foundation"],
    length: 1342,
    chapterLength: QWERTY_CHAPTER_LENGTH,
    chapterCount: 68,
    language: "en",
  },
  {
    id: "top2000",
    name: "Top 2000",
    description: "High-frequency English top 2000 vocabulary",
    category: "English dictionaries",
    tags: ["high frequency"],
    length: 1867,
    chapterLength: QWERTY_CHAPTER_LENGTH,
    chapterCount: 94,
    language: "en",
  },
]

export const QWERTY_DICT_RESOURCES: QwertyDictResource[] = QWERTY_DICT_RESOURCES_FALLBACK

export function getQwertyDictResource(id: string, dictionaries = QWERTY_DICT_RESOURCES) {
  return dictionaries.find(dict => dict.id === id) ?? dictionaries[0] ?? QWERTY_DICT_RESOURCES[0]!
}

export function getQwertyChapterCount(
  dict: Pick<QwertyDictResource, "chapterCount" | "chapterLength" | "length">,
) {
  return dict.chapterCount || Math.max(1, Math.ceil(dict.length / (dict.chapterLength || QWERTY_CHAPTER_LENGTH)))
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

function normalizeQwertyWord(value: unknown, index: number): QwertyWordWithIndex | null {
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

export function normalizeQwertyWords(raw: unknown): QwertyWordWithIndex[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map(normalizeQwertyWord)
    .filter((word): word is QwertyWordWithIndex => word !== null)
}

async function getQwertyDaemonClientOptions() {
  const config = await getLearningBridgeConfig()
  return {
    baseUrl: config.baseUrl,
    token: config.token,
  }
}

export async function loadQwertyDictionaryResources(): Promise<QwertyDictResource[]> {
  const response = await getLearningQwertyDictionaries(await getQwertyDaemonClientOptions())
  return response.dictionaries
}

export async function loadQwertyChapterWords(
  dict: Pick<QwertyDictResource, "id">,
  chapterIndex: number,
): Promise<QwertyWordWithIndex[]> {
  const response = await getLearningQwertyDictionaryChapter(
    dict.id,
    chapterIndex,
    await getQwertyDaemonClientOptions(),
  )
  return response.words
}

export async function loadQwertyWords(dict: QwertyDictResource): Promise<QwertyWordWithIndex[]> {
  const chapterResponses = await Promise.all(
    Array.from({ length: getQwertyChapterCount(dict) }, (_, chapterIndex) =>
      loadQwertyChapterWords(dict, chapterIndex),
    ),
  )
  return chapterResponses.flat()
}

export function getQwertyChapterWords(words: QwertyWordWithIndex[], chapterIndex: number) {
  const safeChapterIndex = Math.max(0, chapterIndex)
  const start = safeChapterIndex * QWERTY_CHAPTER_LENGTH
  return words.slice(start, start + QWERTY_CHAPTER_LENGTH)
}

export function normalizeTypingText(text: string) {
  return text
    .trim()
    .replace(/\s+/g, " ")
}

export function scoreTypingInput(expected: string, input: string, options: { ignoreCase?: boolean } = {}): QwertyTypingResult {
  const normalizedExpected = normalizeTypingText(expected)
  const normalizedInput = normalizeTypingText(input)
  const comparableExpected = options.ignoreCase ? normalizedExpected.toLowerCase() : normalizedExpected
  const comparableInput = options.ignoreCase ? normalizedInput.toLowerCase() : normalizedInput
  const maxLength = Math.max(comparableExpected.length, comparableInput.length)
  const mistakes: QwertyTypingMistake[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const expectedChar = comparableExpected[index] ?? ""
    const actualChar = comparableInput[index] ?? ""
    if (expectedChar !== actualChar) {
      mistakes.push({
        expected: normalizedExpected[index] ?? "",
        actual: normalizedInput[index] ?? "",
        index,
      })
    }
  }

  const matched = Math.max(0, maxLength - mistakes.length)
  return {
    correct: mistakes.length === 0,
    normalizedExpected,
    normalizedInput,
    mistakes,
    accuracy: maxLength === 0 ? 0 : Math.round((matched / maxLength) * 100),
  }
}

export function getWordMeaning(word: QwertyWord) {
  return word.trans.join("; ")
}
