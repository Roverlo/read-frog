export function normalizeLearningText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase()
}
