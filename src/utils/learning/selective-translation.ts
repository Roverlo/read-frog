import type { MasteryProjectionEntry } from "@/utils/learning-contracts"
import { MAX_MASTERY_PROJECTION_TERMS } from "@/utils/learning-contracts"
import { sendMessage } from "@/utils/message"
import { normalizeLearningText } from "./normalize"
import { VOCAB_LIST } from "./vocab-list"

export interface LearningTranslationTerm {
  word: string
  definitionZh: string
  status: "learning" | "dictionary"
}

interface LearningTextToken {
  word: string
  index: number
}

interface LearningPhraseCandidate {
  term: string
  startIndex: number
  endIndex: number
}

const ENGLISH_WORD_RE = /\b[a-z][a-z'-]*\b/gi
const MIN_WORD_LENGTH = 3
const MAX_PHRASE_WORDS = 5
const MASTERY_SKIP_CONFIDENCE = 0.86

const VOCAB_DEFINITION_MAP = new Map(
  VOCAB_LIST.map(entry => [normalizeLearningText(entry.word), entry.definitionZh]),
)

function normalizeToken(token: string) {
  return normalizeLearningText(token.replace(/^'+|'+$/g, ""))
}

function getLearningTokens(text: string): LearningTextToken[] {
  return [...text.matchAll(ENGLISH_WORD_RE)]
    .map((match, index) => ({
      word: normalizeToken(match[0]),
      index,
    }))
    .filter(token => token.word.length >= MIN_WORD_LENGTH)
}

function getCandidatePhrases(tokens: LearningTextToken[]): LearningPhraseCandidate[] {
  const candidates: LearningPhraseCandidate[] = []
  for (let start = 0; start < tokens.length; start += 1) {
    const maxLength = Math.min(MAX_PHRASE_WORDS, tokens.length - start)
    for (let length = maxLength; length >= 2; length -= 1) {
      candidates.push({
        term: tokens.slice(start, start + length).map(token => token.word).join(" "),
        startIndex: tokens[start]!.index,
        endIndex: tokens[start + length - 1]!.index,
      })
    }
  }
  return candidates
}

function getCandidateForms(word: string) {
  const forms = new Set<string>([word])

  if (word.endsWith("ies") && word.length > 4) {
    forms.add(`${word.slice(0, -3)}y`)
  }
  if (word.endsWith("ves") && word.length > 4) {
    forms.add(`${word.slice(0, -3)}f`)
    forms.add(`${word.slice(0, -3)}fe`)
  }
  if (word.endsWith("ing") && word.length > 5) {
    forms.add(word.slice(0, -3))
    forms.add(`${word.slice(0, -3)}e`)
  }
  if (word.endsWith("ed") && word.length > 4) {
    forms.add(word.slice(0, -2))
    forms.add(`${word.slice(0, -2)}e`)
  }
  if (word.endsWith("es") && word.length > 4) {
    forms.add(word.slice(0, -2))
  }
  if (word.endsWith("s") && word.length > 3) {
    forms.add(word.slice(0, -1))
  }

  return [...forms]
}

function findDefinitionForWord(word: string) {
  for (const form of getCandidateForms(word)) {
    const definition = VOCAB_DEFINITION_MAP.get(form)
    if (definition) {
      return definition
    }
  }
  return undefined
}

function findProjectionEntryForWord(entriesByText: Map<string, MasteryProjectionEntry>, word: string) {
  return getCandidateForms(word)
    .map(form => entriesByText.get(form))
    .find(Boolean)
}

function isProjectionEntryDue(entry: MasteryProjectionEntry, now = new Date()) {
  return entry.dueAt ? Date.parse(entry.dueAt) <= now.getTime() : false
}

export function shouldTranslateProjectionEntry(entry: MasteryProjectionEntry, now = new Date()) {
  if (entry.status === "archived") {
    return false
  }

  if (
    entry.status === "mature"
    && entry.confidence >= MASTERY_SKIP_CONFIDENCE
    && !isProjectionEntryDue(entry, now)
  ) {
    return false
  }

  return true
}

async function getProjectionEntriesByTerm(queryTerms: string[]) {
  try {
    const terms = [...new Set(queryTerms)]
      .filter(Boolean)
      .slice(0, MAX_MASTERY_PROJECTION_TERMS)
    const response = await sendMessage("getLearningProjectionTerms", { terms })
    if (response.status !== "ok" && response.status !== "cached") {
      return new Map<string, MasteryProjectionEntry>()
    }

    return new Map(
      response.entries
        .filter(entry => entry.kind === "word" || entry.kind === "phrase")
        .map(entry => [entry.normalizedText, entry]),
    )
  }
  catch {
    return new Map<string, MasteryProjectionEntry>()
  }
}

export async function buildLearningTranslationSummary(text: string, maxTerms: number): Promise<string> {
  const tokens = getLearningTokens(text)

  if (tokens.length === 0) {
    return ""
  }

  const phraseCandidates = getCandidatePhrases(tokens)
  const uniqueWords = [...new Set(tokens.map(token => token.word))]
  const projectionEntriesByText = await getProjectionEntriesByTerm([
    ...phraseCandidates.map(candidate => candidate.term),
    ...uniqueWords.flatMap(getCandidateForms),
  ])

  const terms: LearningTranslationTerm[] = []
  const coveredTokenIndexes = new Set<number>()

  for (const phrase of phraseCandidates) {
    if (terms.length >= maxTerms) {
      break
    }
    if ([...coveredTokenIndexes].some(index => index >= phrase.startIndex && index <= phrase.endIndex)) {
      continue
    }

    const projectionEntry = projectionEntriesByText.get(phrase.term)
    if (!projectionEntry || projectionEntry.kind !== "phrase") {
      continue
    }

    if (!shouldTranslateProjectionEntry(projectionEntry)) {
      for (let index = phrase.startIndex; index <= phrase.endIndex; index += 1) {
        coveredTokenIndexes.add(index)
      }
      continue
    }

    if (!projectionEntry.definition) {
      continue
    }

    terms.push({
      word: phrase.term,
      definitionZh: projectionEntry.definition,
      status: "learning",
    })
    for (let index = phrase.startIndex; index <= phrase.endIndex; index += 1) {
      coveredTokenIndexes.add(index)
    }
  }

  const seenWords = new Set<string>()
  for (const token of tokens) {
    if (coveredTokenIndexes.has(token.index) || seenWords.has(token.word)) {
      continue
    }
    seenWords.add(token.word)

    const word = token.word
    const projectionEntry = findProjectionEntryForWord(projectionEntriesByText, word)
    if (projectionEntry && !shouldTranslateProjectionEntry(projectionEntry)) {
      continue
    }

    const definitionZh = projectionEntry?.definition ?? findDefinitionForWord(word)
    if (!definitionZh) {
      continue
    }

    terms.push({
      word,
      definitionZh,
      status: projectionEntry && projectionEntry.status !== "unknown"
        ? "learning"
        : "dictionary",
    })

    if (terms.length >= maxTerms) {
      break
    }
  }

  if (terms.length === 0) {
    return ""
  }

  return terms
    .map(term => `${term.word}: ${term.definitionZh}`)
    .join("  |  ")
}
