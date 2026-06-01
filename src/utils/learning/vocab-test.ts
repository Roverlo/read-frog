import type { VocabListEntry } from "./vocab-list"
import type { VocabQuestion } from "@/types/learning"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { VOCAB_LIST } from "./vocab-list"

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = result[index]!
    result[index] = result[swapIndex]!
    result[swapIndex] = current
  }
  return result
}

function buildChoices(entry: VocabListEntry) {
  const distractors = shuffle(
    VOCAB_LIST.filter(candidate => candidate.word !== entry.word),
  )
    .slice(0, 3)
    .map(candidate => candidate.definitionZh)

  return shuffle([entry.definitionZh, ...distractors])
}

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"] as const

function getCefrLevel(entry: VocabListEntry): (typeof LEVEL_ORDER)[number] {
  const bandEntries = VOCAB_LIST.filter(candidate => candidate.level === entry.level)
  const bandIndex = bandEntries.findIndex(candidate => candidate.word === entry.word)
  const splitIndex = Math.ceil(bandEntries.length / 2)

  if (entry.level === "basic") {
    return bandIndex < splitIndex ? "A1" : "A2"
  }
  if (entry.level === "intermediate") {
    return bandIndex < splitIndex ? "B1" : "B2"
  }
  return "C1"
}

export function createVocabQuestions(count = 20): VocabQuestion[] {
  const byLevel = LEVEL_ORDER.flatMap(level =>
    shuffle(VOCAB_LIST.filter(entry => getCefrLevel(entry) === level)).slice(0, Math.ceil(count / LEVEL_ORDER.length)),
  )

  return shuffle(byLevel.length >= count ? byLevel : VOCAB_LIST)
    .slice(0, count)
    .map(entry => ({
      id: getRandomUUID(),
      word: entry.word,
      answer: entry.definitionZh,
      choices: buildChoices(entry),
      level: getCefrLevel(entry),
    }))
}

export function estimateVocabularySize(questions: VocabQuestion[], correctQuestionIds: Set<string>) {
  const answered = questions.length
  if (answered === 0) {
    return 0
  }

  const weightedTotal = questions.reduce((sum, question) => {
    const entry = VOCAB_LIST.find(candidate => candidate.word === question.word)
    return sum + (entry?.weight ?? 1)
  }, 0)
  const weightedCorrect = questions.reduce((sum, question) => {
    if (!correctQuestionIds.has(question.id)) {
      return sum
    }
    const entry = VOCAB_LIST.find(candidate => candidate.word === question.word)
    return sum + (entry?.weight ?? 1)
  }, 0)

  const ratio = weightedCorrect / Math.max(weightedTotal, 1)
  return Math.round(800 + ratio * 7200)
}

export function summarizeWeakLevels(questions: VocabQuestion[], correctQuestionIds: Set<string>) {
  return LEVEL_ORDER
    .map((level) => {
      const levelQuestions = questions.filter(question => question.level === level)
      if (levelQuestions.length === 0) {
        return null
      }
      const correct = levelQuestions.filter(question => correctQuestionIds.has(question.id)).length
      return {
        level,
        correct,
        total: levelQuestions.length,
        accuracy: correct / levelQuestions.length,
      }
    })
    .filter(level => level && level.accuracy < 0.7)
    .map(level => level!.level)
}
