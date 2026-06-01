import type { QwertyDictResource, QwertyTypingResult, QwertyWordWithIndex } from "./qwerty-dicts"
import type { LearningQwertyChapterRecordRequest, LearningQwertyWordRecordRequest } from "@/utils/learning-contracts"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { sendMessage } from "@/utils/message"
import { getWordMeaning } from "./qwerty-dicts"

export async function saveQwertyTypingResult(input: {
  dict: QwertyDictResource
  word: QwertyWordWithIndex
  typedText: string
  result: QwertyTypingResult
  chapterIndex: number
  durationMs: number
}) {
  const record: LearningQwertyWordRecordRequest = {
    id: getRandomUUID(),
    word: input.word.name,
    input: input.typedText,
    correct: input.result.correct,
    accuracy: Math.max(0, Math.min(1, input.result.accuracy / 100)),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    dictId: input.dict.id,
    dictName: input.dict.name,
    chapterIndex: input.chapterIndex,
    wordIndex: input.word.index,
    definition: getWordMeaning(input.word),
    mistakes: input.result.mistakes,
    createdAt: new Date().toISOString(),
  }

  const result = await sendMessage("syncLearningQwertyWordRecord", record)
  return { record, result }
}

export async function saveQwertyChapterResult(input: {
  dict: QwertyDictResource
  chapterIndex: number
  durationMs: number
  wordCount: number
  correctCount: number
  wrongCount: number
  correctWordIndexes: number[]
}) {
  const accuracy = input.wordCount > 0
    ? input.correctCount / input.wordCount
    : 0
  const record: LearningQwertyChapterRecordRequest = {
    id: getRandomUUID(),
    dictId: input.dict.id,
    dictName: input.dict.name,
    chapterIndex: input.chapterIndex,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    wordCount: Math.max(0, Math.round(input.wordCount)),
    correctCount: Math.max(0, Math.round(input.correctCount)),
    wrongCount: Math.max(0, Math.round(input.wrongCount)),
    accuracy: Math.max(0, Math.min(1, accuracy)),
    correctWordIndexes: [...new Set(input.correctWordIndexes)]
      .filter(index => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b),
    createdAt: new Date().toISOString(),
  }

  const result = await sendMessage("syncLearningQwertyChapterRecord", record)
  return { record, result }
}

export async function getQwertyTypingStats() {
  const result = await sendMessage("getLearningWorkspaceState", undefined)
  if (result.status === "ok" && result.state) {
    return {
      total: result.state.stats.qwertyRecordCount,
      correct: result.state.stats.correctQwertyRecordCount,
      wrong: result.state.stats.qwertyRecordCount - result.state.stats.correctQwertyRecordCount,
      averageAccuracy: Math.round(result.state.stats.averageAccuracy * 100),
      averageDurationMs: result.state.stats.averageDurationMs ?? 0,
    }
  }

  return {
    total: 0,
    correct: 0,
    wrong: 0,
    averageAccuracy: 0,
    averageDurationMs: 0,
  }
}
