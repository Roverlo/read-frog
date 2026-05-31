import { browser } from "#imports"

type RuntimeWithLooseGetURL = {
  runtime: {
    getURL: (path: string) => string
  }
}

export interface QwertyDictResource {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  path: string
  length: number
  language: "en"
}

export interface QwertyWord {
  name: string
  trans: string[]
  usphone?: string
  ukphone?: string
  notation?: string
}

export interface QwertyWordWithIndex extends QwertyWord {
  index: number
}

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

export const QWERTY_DICT_RESOURCES: QwertyDictResource[] = [
  {
    id: "cet4",
    name: "CET-4",
    description: "大学英语四级核心词库",
    category: "中国考试",
    tags: ["大学英语", "四级"],
    path: "/dicts/qwerty/CET4_T.json",
    length: 2607,
    language: "en",
  },
  {
    id: "cet6",
    name: "CET-6",
    description: "大学英语六级核心词库",
    category: "中国考试",
    tags: ["大学英语", "六级"],
    path: "/dicts/qwerty/CET6_T.json",
    length: 2345,
    language: "en",
  },
  {
    id: "toefl",
    name: "TOEFL",
    description: "托福考试高频词库",
    category: "国际考试",
    tags: ["TOEFL"],
    path: "/dicts/qwerty/TOEFL_3_T.json",
    length: 4264,
    language: "en",
  },
  {
    id: "gre1500",
    name: "GRE 1500",
    description: "GRE 高频重点词库",
    category: "国际考试",
    tags: ["GRE"],
    path: "/dicts/qwerty/GRE_1500.json",
    length: 1533,
    language: "en",
  },
  {
    id: "oxford3000",
    name: "Oxford 3000",
    description: "牛津 3000 基础高频词",
    category: "英语词典",
    tags: ["高频", "基础"],
    path: "/dicts/qwerty/Oxford3000.json",
    length: 1342,
    language: "en",
  },
  {
    id: "top2000",
    name: "Top 2000",
    description: "英语高频 2000 词",
    category: "英语词典",
    tags: ["高频"],
    path: "/dicts/qwerty/top2000words.json",
    length: 1867,
    language: "en",
  },
]

export function getQwertyDictResource(id: string) {
  return QWERTY_DICT_RESOURCES.find(dict => dict.id === id) ?? QWERTY_DICT_RESOURCES[0]!
}

export function getQwertyChapterCount(dict: Pick<QwertyDictResource, "length">) {
  return Math.max(1, Math.ceil(dict.length / QWERTY_CHAPTER_LENGTH))
}

export function getQwertyDictUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path
  }
  return (browser as RuntimeWithLooseGetURL).runtime.getURL(path.replace(/^\//, ""))
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

export async function loadQwertyWords(dict: QwertyDictResource): Promise<QwertyWordWithIndex[]> {
  const response = await fetch(getQwertyDictUrl(dict.path))
  if (!response.ok) {
    throw new Error(`Failed to load dictionary ${dict.name}: ${response.status}`)
  }
  return normalizeQwertyWords(await response.json())
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
