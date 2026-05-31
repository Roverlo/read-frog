import type { LearningItem } from "@/types/learning"
import type { MasteryProjectionEntry } from "@/utils/learning-contracts"
import { db } from "@/utils/db/dexie/db"
import { MAX_MASTERY_PROJECTION_TERMS } from "@/utils/learning-contracts"
import { sendMessage } from "@/utils/message"
import { normalizeLearningText } from "./items"
import { VOCAB_LIST } from "./vocab-list"

export interface LearningTranslationTerm {
  word: string
  definitionZh: string
  status: "learning" | "dictionary"
}

const ENGLISH_WORD_RE = /\b[a-z][a-z'-]*\b/gi
const MIN_WORD_LENGTH = 3

const VOCAB_DEFINITION_MAP = new Map(
  VOCAB_LIST.map(entry => [normalizeLearningText(entry.word), entry.definitionZh]),
)

function normalizeToken(token: string) {
  return normalizeLearningText(token.replace(/^'+|'+$/g, ""))
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

function findLearningItemForWord(itemsByText: Map<string, LearningItem>, word: string) {
  return getCandidateForms(word)
    .map(form => itemsByText.get(form))
    .find(Boolean)
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

async function getProjectionEntriesByWord(uniqueWords: string[]) {
  try {
    const terms = [...new Set(uniqueWords.flatMap(getCandidateForms))]
      .slice(0, MAX_MASTERY_PROJECTION_TERMS)
    const response = await sendMessage("getLearningProjectionTerms", { terms })
    if (response.status !== "ok") {
      return new Map<string, MasteryProjectionEntry>()
    }

    return new Map(
      response.entries
        .filter(entry => entry.kind === "word")
        .map(entry => [entry.normalizedText, entry]),
    )
  }
  catch {
    return new Map<string, MasteryProjectionEntry>()
  }
}

export async function buildLearningTranslationSummary(text: string, maxTerms: number): Promise<string> {
  const tokens = [...text.matchAll(ENGLISH_WORD_RE)]
    .map(match => normalizeToken(match[0]))
    .filter(word => word.length >= MIN_WORD_LENGTH)

  if (tokens.length === 0) {
    return ""
  }

  const uniqueWords = [...new Set(tokens)]
  const [projectionEntriesByText, items] = await Promise.all([
    getProjectionEntriesByWord(uniqueWords),
    db.learningItems
      .where("kind")
      .equals("word")
      .toArray(),
  ])
  const itemsByText = new Map(items.map(item => [item.normalizedText, item]))

  const terms: LearningTranslationTerm[] = []
  for (const word of uniqueWords) {
    const projectionEntry = findProjectionEntryForWord(projectionEntriesByText, word)
    if (projectionEntry?.status === "mature" || projectionEntry?.status === "archived") {
      continue
    }

    const item = findLearningItemForWord(itemsByText, word)
    if (!projectionEntry && item?.status === "mastered") {
      continue
    }

    const definitionZh = projectionEntry?.definition ?? item?.explanation?.meaningZh ?? findDefinitionForWord(word)
    if (!definitionZh) {
      continue
    }

    terms.push({
      word,
      definitionZh,
      status: projectionEntry && projectionEntry.status !== "unknown"
        ? "learning"
        : item?.status === "learning" ? "learning" : "dictionary",
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
