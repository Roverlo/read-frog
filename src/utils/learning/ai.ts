import type { LearningExplanation, LearningItem, ReviewQuestion } from "@/types/learning"
import type { LLMProviderConfig } from "@/types/config/provider"
import { sendMessage } from "@/utils/message"
import { resolveModelId } from "@/utils/providers/model-id"
import { getProviderOptionsWithOverride } from "@/utils/providers/options"

function buildProviderOptions(providerConfig: LLMProviderConfig) {
  const modelName = resolveModelId(providerConfig.model)
  return getProviderOptionsWithOverride(
    modelName ?? "",
    providerConfig.provider,
    providerConfig.providerOptions,
  )
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) {
    return null
  }
  return text.slice(start, end + 1)
}

export async function generateLearningExplanation(input: {
  text: string
  context?: string
  providerConfig?: LLMProviderConfig | null
}): Promise<LearningExplanation> {
  if (!input.providerConfig) {
    return {
      meaningZh: "暂未配置 AI 提供商。已保存到待学习库，可稍后补充解释。",
      examples: [],
    }
  }

  const response = await sendMessage("backgroundGenerateText", {
    providerId: input.providerConfig.id,
    system: "You are an English tutor for a Chinese learner. Return compact JSON only.",
    prompt: [
      "Explain the selected English learning item in Chinese.",
      "Return JSON with keys: meaningZh string, examples string[], notes string, extractedItems string[].",
      `Text: ${input.text}`,
      input.context ? `Context: ${input.context}` : "",
    ].filter(Boolean).join("\n"),
    temperature: input.providerConfig.temperature,
    providerOptions: buildProviderOptions(input.providerConfig),
    maxRetries: 1,
  })

  try {
    const jsonText = extractJsonObject(response.text)
    if (jsonText) {
      const parsed = JSON.parse(jsonText) as Partial<LearningExplanation>
      return {
        meaningZh: parsed.meaningZh || "AI 未返回有效解释。",
        examples: Array.isArray(parsed.examples) ? parsed.examples.filter(Boolean) : [],
        notes: parsed.notes,
        extractedItems: Array.isArray(parsed.extractedItems) ? parsed.extractedItems.filter(Boolean) : [],
      }
    }
  }
  catch {
    // Fall through to plain-text fallback.
  }

  return {
    meaningZh: response.text.trim() || "AI 未返回有效解释。",
    examples: [],
  }
}

export interface GeneratedReviewMaterial {
  title: string
  material: string
  materialZh?: string
  questions: ReviewQuestion[]
}

export async function generateReviewMaterial(input: {
  items: LearningItem[]
  providerConfig?: LLMProviderConfig | null
}): Promise<GeneratedReviewMaterial> {
  const fallbackQuestions: ReviewQuestion[] = input.items.slice(0, 4).map(item => ({
    id: item.id,
    prompt: `下面哪个中文意思最接近 "${item.text}"？`,
    answer: item.explanation?.meaningZh ?? item.text,
    choices: [
      item.explanation?.meaningZh ?? item.text,
      "与上下文无关的含义",
      "表示完全相反的意思",
      "仅表示时间或地点",
    ],
    itemIds: [item.id],
  }))

  if (!input.providerConfig) {
    return {
      title: "待学习内容复习",
      material: input.items.map(item => item.text).join(" / "),
      materialZh: "暂未配置 AI 提供商。这里先使用待学习内容列表进行复习。",
      questions: fallbackQuestions,
    }
  }

  const compactItems = input.items.map(item => ({
    id: item.id,
    text: item.text,
    meaningZh: item.explanation?.meaningZh,
  }))

  const response = await sendMessage("backgroundGenerateText", {
    providerId: input.providerConfig.id,
    system: "You are an English tutor. Return valid compact JSON only.",
    prompt: [
      "Use the learning items to write an interesting short English passage or dialogue for a Chinese learner.",
      "Return JSON with keys: title, material, materialZh, questions.",
      "questions must be an array of objects: id, prompt, answer, choices, itemIds.",
      "Each question should have 4 Chinese choices and one exact answer included in choices.",
      `Learning items: ${JSON.stringify(compactItems)}`,
    ].join("\n"),
    temperature: input.providerConfig.temperature ?? 0.7,
    providerOptions: buildProviderOptions(input.providerConfig),
    maxRetries: 1,
  })

  try {
    const jsonText = extractJsonObject(response.text)
    if (jsonText) {
      const parsed = JSON.parse(jsonText) as Partial<GeneratedReviewMaterial>
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .filter(question => question && typeof question.prompt === "string")
            .map((question, index) => ({
              id: typeof question.id === "string" ? question.id : `q-${index}`,
              prompt: question.prompt,
              answer: typeof question.answer === "string" ? question.answer : "",
              choices: Array.isArray(question.choices) ? question.choices.filter(Boolean).map(String) : [],
              itemIds: Array.isArray(question.itemIds) ? question.itemIds.filter(Boolean).map(String) : [],
            }))
            .filter(question => question.answer && question.choices.includes(question.answer))
        : []

      return {
        title: parsed.title || "AI 复习短文",
        material: parsed.material || response.text,
        materialZh: parsed.materialZh,
        questions: questions.length > 0 ? questions : fallbackQuestions,
      }
    }
  }
  catch {
    // Fall through to fallback using the raw response as material.
  }

  return {
    title: "AI 复习短文",
    material: response.text.trim(),
    questions: fallbackQuestions,
  }
}
