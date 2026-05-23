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

export function createVocabQuestions(count = 12): VocabQuestion[] {
  return shuffle(VOCAB_LIST)
    .slice(0, count)
    .map(entry => ({
      id: getRandomUUID(),
      word: entry.word,
      answer: entry.definitionZh,
      choices: buildChoices(entry),
      level: entry.level,
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
