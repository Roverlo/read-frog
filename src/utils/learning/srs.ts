import type { Card, Grade } from "ts-fsrs"
import type { LearningItem, LearningMaturity, LearningReviewRating, LearningSrsCard } from "@/types/learning"
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from "ts-fsrs"

const DEFAULT_DESIRED_RETENTION = 0.9
const MATURE_INTERVAL_DAYS = 21

const RATING_MAP: Record<LearningReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

function toIso(value: Date | undefined) {
  return value?.toISOString()
}

function fromIso(value: string | undefined) {
  return value ? new Date(value) : undefined
}

export function serializeSrsCard(card: Card): LearningSrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: toIso(card.last_review),
  }
}

export function deserializeSrsCard(card: LearningSrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: fromIso(card.last_review),
  }
}

export function createInitialSrsCard(now = new Date()) {
  return serializeSrsCard(createEmptyCard(now))
}

export function getLearningMaturity(card: LearningSrsCard | undefined): LearningMaturity {
  if (!card || card.reps === 0) {
    return "new"
  }
  if (card.state === State.Learning || card.state === State.Relearning) {
    return "learning"
  }
  if (card.scheduled_days >= MATURE_INTERVAL_DAYS) {
    return "mature"
  }
  return "review"
}

export function isSrsMastered(card: LearningSrsCard | undefined, consecutivePasses: number) {
  return consecutivePasses >= 2 || (card?.scheduled_days ?? 0) >= MATURE_INTERVAL_DAYS
}

export function applySrsReview(input: {
  item: LearningItem
  rating: LearningReviewRating
  reviewedAt?: Date
  desiredRetention?: number
}) {
  const reviewedAt = input.reviewedAt ?? new Date()
  const scheduler = fsrs(generatorParameters({
    request_retention: input.desiredRetention ?? DEFAULT_DESIRED_RETENTION,
  }))
  const before = input.item.srsCard ?? createInitialSrsCard(input.item.createdAt)
  const result = scheduler.next(deserializeSrsCard(before), reviewedAt, RATING_MAP[input.rating])
  const after = serializeSrsCard(result.card)

  return {
    before,
    after,
    dueAt: result.card.due,
    maturity: getLearningMaturity(after),
  }
}
