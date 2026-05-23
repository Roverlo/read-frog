export type LearningItemKind = "word" | "phrase" | "sentence" | "paragraph"

export type LearningItemStatus = "learning" | "mastered" | "archived"

export interface LearningExplanation {
  meaningZh: string
  examples: string[]
  notes?: string
  extractedItems?: string[]
}

export interface LearningItem {
  id: string
  kind: LearningItemKind
  text: string
  normalizedText: string
  status: LearningItemStatus
  source: "vocab-test" | "selection" | "manual" | "review"
  sourceUrl?: string
  sourceTitle?: string
  context?: string
  explanation?: LearningExplanation
  consecutivePasses: number
  reviewCount: number
  correctCount: number
  incorrectCount: number
  createdAt: Date
  updatedAt: Date
  masteredAt?: Date
  nextReviewAt?: Date
}

export interface VocabQuestion {
  id: string
  word: string
  answer: string
  choices: string[]
  level: string
}

export interface VocabTestSession {
  id: string
  createdAt: Date
  updatedAt: Date
  totalCount: number
  correctCount: number
  estimatedVocabulary: number
  questions: VocabQuestion[]
  answers: Array<{
    questionId: string
    selectedAnswer: string
    correct: boolean
  }>
}

export interface ReviewQuestion {
  id: string
  prompt: string
  answer: string
  choices: string[]
  itemIds: string[]
}

export interface ReviewSession {
  id: string
  createdAt: Date
  updatedAt: Date
  itemIds: string[]
  title: string
  material: string
  materialZh?: string
  questions: ReviewQuestion[]
  answers: Array<{
    questionId: string
    selectedAnswer: string
    correct: boolean
  }>
  passed: boolean
}

export interface GithubLearningSyncConfig {
  id: string
  owner: string
  repo: string
  branch: string
  path: string
  token?: string
  clientId?: string
  lastSyncAt?: Date
  updatedAt: Date
}

export interface LearningDataExport {
  schemaVersion: 1
  exportedAt: string
  items: Array<SerializedLearningItem>
  vocabTestSessions: Array<SerializedVocabTestSession>
  reviewSessions: Array<SerializedReviewSession>
}

export type SerializedLearningItem = Omit<LearningItem, "createdAt" | "updatedAt" | "masteredAt" | "nextReviewAt"> & {
  createdAt: string
  updatedAt: string
  masteredAt?: string
  nextReviewAt?: string
}

export type SerializedVocabTestSession = Omit<VocabTestSession, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
}

export type SerializedReviewSession = Omit<ReviewSession, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
}
