import type { LLMProviderConfig, ProvidersConfig } from "@/types/config/provider"
import type { GithubLearningSyncConfig, LearningItem, LearningReviewRating, LearningSettings, ReviewQuestion, VocabQuestion } from "@/types/learning"
import { Icon } from "@iconify/react"
import { saveAs } from "file-saver"
import { useAtom, useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/base-ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/base-ui/empty"
import { Input } from "@/components/ui/base-ui/input"
import { Label } from "@/components/ui/base-ui/label"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/base-ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/base-ui/select"
import { Separator } from "@/components/ui/base-ui/separator"
import { Switch } from "@/components/ui/base-ui/switch"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { isLLMProviderConfig } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { db } from "@/utils/db/dexie/db"
import { extractLearningChildren, generateLearningExplanation, generateReviewMaterial } from "@/utils/learning/ai"
import { exportLearningData, mergeLearningData } from "@/utils/learning/export"
import { createPrivateLearningDataRepo, getGithubLearningSyncConfig, pollGithubDeviceToken, requestGithubDeviceCode, saveGithubLearningSyncConfig, syncLearningDataToGithub } from "@/utils/learning/github-sync"
import { getLearningStats, markLearningItemReviewRating, upsertLearningItem } from "@/utils/learning/items"
import { getLearningSettings, saveLearningSettings } from "@/utils/learning/settings"
import { createVocabQuestions, estimateVocabularySize, summarizeWeakLevels } from "@/utils/learning/vocab-test"
import { cn } from "@/utils/styles/utils"
import { PageLayout } from "../../components/page-layout"

interface LearningDashboardData {
  items: LearningItem[]
  stats: Awaited<ReturnType<typeof getLearningStats>>
  settings: LearningSettings
}

interface LearningSettingsData {
  settings: LearningSettings
  syncConfig: GithubLearningSyncConfig | undefined
}

const DEFAULT_SYNC = {
  owner: "Roverlo",
  repo: "read-frog-learning-data",
  branch: "main",
  path: "read-frog-learning-data.json",
}

const RATING_OPTIONS: Array<{ value: LearningReviewRating, label: string, icon: string }> = [
  { value: "again", label: "Again", icon: "tabler:rotate-clockwise" },
  { value: "hard", label: "Hard", icon: "tabler:equal" },
  { value: "good", label: "Good", icon: "tabler:check" },
  { value: "easy", label: "Easy", icon: "tabler:chevrons-up" },
]

function getFirstEnabledLLMProvider(providersConfig: ProvidersConfig): LLMProviderConfig | null {
  return providersConfig.find((provider): provider is LLMProviderConfig =>
    isLLMProviderConfig(provider) && provider.enabled,
  ) ?? null
}

async function loadLearningDashboardData(): Promise<LearningDashboardData> {
  const [items, stats, settings] = await Promise.all([
    db.learningItems.orderBy("updatedAt").reverse().toArray(),
    getLearningStats(),
    getLearningSettings(),
  ])
  return { items, stats, settings }
}

async function loadLearningSettingsData(): Promise<LearningSettingsData> {
  const [settings, syncConfig] = await Promise.all([
    getLearningSettings(),
    getGithubLearningSyncConfig(),
  ])
  return { settings, syncConfig }
}

function dueTime(item: LearningItem) {
  return item.dueAt?.getTime() ?? item.nextReviewAt?.getTime() ?? item.createdAt.getTime()
}

function getDueItems(items: LearningItem[], settings: LearningSettings) {
  const now = Date.now()
  return items
    .filter(item =>
      item.status === "learning" || (settings.includeMasteredInReview && item.status === "mastered"),
    )
    .filter(item => dueTime(item) <= now)
    .sort((a, b) => dueTime(a) - dueTime(b))
}

function StatTile({ label, value, tone, icon }: { label: string, value: number | string, tone: "coral" | "mustard" | "olive" | "ink", icon: string }) {
  const toneClass = {
    coral: "border-[#ed6f5c]/30 bg-[#ed6f5c]/10 text-[#8c3328]",
    mustard: "border-[#e9b94a]/40 bg-[#e9b94a]/10 text-[#70510d]",
    olive: "border-[#6e7448]/35 bg-[#6e7448]/10 text-[#3f4424]",
    ink: "border-foreground/15 bg-muted/40 text-foreground",
  }[tone]

  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <Icon icon={icon} className="size-5 opacity-70" />
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] opacity-75">{label}</div>
    </div>
  )
}

function ItemBadge({ item }: { item: LearningItem }) {
  const label = item.status === "mastered" ? "已掌握" : item.status === "archived" ? "已归档" : "待学习"
  return (
    <Badge
      variant={item.status === "mastered" ? "accent" : item.status === "archived" ? "outline" : "secondary"}
      size="sm"
    >
      {label}
    </Badge>
  )
}

function DueMeta({ item }: { item: LearningItem }) {
  const next = item.dueAt ?? item.nextReviewAt
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
      <span>
        {item.maturity ?? "new"}
      </span>
      <span>
        通过
        {item.consecutivePasses}
        /2
      </span>
      <span>
        复习
        {item.reviewCount}
      </span>
      {next && (
        <span>
          下次
          {next.toLocaleString()}
        </span>
      )}
    </div>
  )
}

function LearningItemRow({
  item,
  selected,
  onSelect,
  onChanged,
}: {
  item: LearningItem
  selected?: boolean
  onSelect?: () => void
  onChanged: () => void
}) {
  const markMastered = async () => {
    await db.learningItems.put({
      ...item,
      status: "mastered",
      consecutivePasses: Math.max(item.consecutivePasses, 2),
      masteredAt: item.masteredAt ?? new Date(),
      dueAt: undefined,
      nextReviewAt: undefined,
      maturity: "mature",
      updatedAt: new Date(),
    })
    onChanged()
  }

  const archive = async () => {
    await db.learningItems.put({
      ...item,
      status: "archived",
      updatedAt: new Date(),
    })
    onChanged()
  }

  return (
    <div
      className={cn(
        "grid gap-3 rounded-lg border border-border/70 bg-card/70 p-3 md:grid-cols-[minmax(0,1fr)_auto]",
        selected && "border-[#ed6f5c]/50 bg-[#ed6f5c]/5",
      )}
    >
      <button type="button" className="min-w-0 text-left" onClick={onSelect}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.text}</span>
          <ItemBadge item={item} />
          <Badge variant="outline" size="sm">{item.kind}</Badge>
          {item.parentId && <Badge variant="outline" size="sm">抽取</Badge>}
        </div>
        {item.explanation?.meaningZh && (
          <p className="mt-2 text-sm text-muted-foreground">{item.explanation.meaningZh}</p>
        )}
        {item.context && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.context}</p>
        )}
        <div className="mt-2">
          <DueMeta item={item} />
        </div>
      </button>
      <div className="flex items-start gap-2">
        {item.status !== "mastered" && (
          <Button type="button" size="sm" variant="outline" onClick={markMastered} title="标记掌握">
            <Icon icon="tabler:check" />
          </Button>
        )}
        {item.status !== "archived" && (
          <Button type="button" size="sm" variant="ghost" onClick={archive} title="归档">
            <Icon icon="tabler:archive" />
          </Button>
        )}
      </div>
    </div>
  )
}

function ReviewQueue({
  items,
  selectedId,
  onSelect,
}: {
  items: LearningItem[]
  selectedId?: string
  onSelect: (item: LearningItem) => void
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>今日队列</CardTitle>
        <CardDescription>按 FSRS 到期时间排序。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.length === 0
          ? (
              <Empty className="border p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon icon="tabler:calendar-check" />
                  </EmptyMedia>
                  <EmptyTitle>暂无到期内容</EmptyTitle>
                  <EmptyDescription>可以先做词测或从网页划词加入待学习。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          : items.map(item => (
              <button
                key={item.id}
                type="button"
                className={cn("rounded-lg border p-3 text-left text-sm hover:bg-muted/50", selectedId === item.id && "border-[#ed6f5c]/50 bg-[#ed6f5c]/5")}
                onClick={() => onSelect(item)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.text}</span>
                  <Badge variant="outline" size="sm">{item.kind}</Badge>
                </div>
                <div className="mt-2">
                  <DueMeta item={item} />
                </div>
              </button>
            ))}
      </CardContent>
    </Card>
  )
}

function VocabTestPanel({ providerConfig, onChanged }: { providerConfig: LLMProviderConfig | null, onChanged: () => void }) {
  const [questions, setQuestions] = useState<VocabQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ correct: number, total: number, estimated: number, weakLevels: string[] } | null>(null)

  const startTest = () => {
    setQuestions(createVocabQuestions(20))
    setAnswers({})
    setResult(null)
  }

  const submit = async () => {
    setIsSubmitting(true)
    try {
      const correctQuestionIds = new Set(
        questions
          .filter(question => answers[question.id] === question.answer)
          .map(question => question.id),
      )
      const estimated = estimateVocabularySize(questions, correctQuestionIds)
      const weakLevels = summarizeWeakLevels(questions, correctQuestionIds)
      const now = new Date()
      await db.vocabTestSessions.add({
        id: getRandomUUID(),
        createdAt: now,
        updatedAt: now,
        totalCount: questions.length,
        correctCount: correctQuestionIds.size,
        estimatedVocabulary: estimated,
        questions,
        answers: questions.map(question => ({
          questionId: question.id,
          selectedAnswer: answers[question.id] ?? "",
          correct: correctQuestionIds.has(question.id),
        })),
      })

      for (const question of questions) {
        const correct = correctQuestionIds.has(question.id)
        const explanation = correct
          ? { meaningZh: question.answer, examples: [] }
          : await generateLearningExplanation({
              text: question.word,
              context: `词汇量测试中未选中正确释义：${question.answer}`,
              providerConfig,
            })
        await upsertLearningItem({
          text: question.word,
          kind: "word",
          status: correct ? "mastered" : "learning",
          source: "vocab-test",
          explanation,
          tags: [`level:${question.level}`],
        })
      }

      setResult({ correct: correctQuestionIds.size, total: questions.length, estimated, weakLevels })
      onChanged()
      toast.success("词汇量测试已保存")
    }
    catch (error) {
      toast.error("词汇量测试保存失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>词汇量测试</CardTitle>
        <CardDescription>20 题分级抽样，答错进入待学习，答对进入已掌握。</CardDescription>
        <CardAction>
          <Button type="button" size="sm" onClick={startTest}>
            <Icon icon="tabler:cards" />
            开始
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.length === 0
          ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon icon="tabler:cards" />
                  </EmptyMedia>
                  <EmptyTitle>开始一次分级词测</EmptyTitle>
                  <EmptyDescription>A1-C1 混合抽题，结果会自动更新知识库。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          : (
              <>
                <Progress value={(Object.keys(answers).length / questions.length) * 100}>
                  <ProgressLabel>完成进度</ProgressLabel>
                  <ProgressValue>{() => `${Object.keys(answers).length}/${questions.length}`}</ProgressValue>
                </Progress>
                <div className="grid gap-3">
                  {questions.map((question, index) => (
                    <div key={question.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Q
                            {index + 1}
                          </span>
                          <div className="text-lg font-semibold">{question.word}</div>
                        </div>
                        <Badge variant="outline">{question.level}</Badge>
                      </div>
                      <RadioGroup
                        className="mt-3 grid gap-2 md:grid-cols-2"
                        value={answers[question.id] ?? ""}
                        onValueChange={(value: unknown) => setAnswers(prev => ({ ...prev, [question.id]: String(value) }))}
                      >
                        {question.choices.map(choice => (
                          <label key={choice} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
                            <RadioGroupItem value={choice} />
                            <span>{choice}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {result
                    ? (
                        <div className="text-sm">
                          答对
                          {" "}
                          {result.correct}
                          /
                          {result.total}
                          ，估算词汇量约
                          {" "}
                          {result.estimated.toLocaleString()}
                          。薄弱等级：
                          {" "}
                          {result.weakLevels.length > 0 ? result.weakLevels.join(", ") : "暂无"}
                        </div>
                      )
                    : <span />}
                  <Button
                    type="button"
                    disabled={Object.keys(answers).length < questions.length || isSubmitting}
                    onClick={submit}
                  >
                    {isSubmitting ? "保存中..." : "提交测试"}
                  </Button>
                </div>
              </>
            )}
      </CardContent>
    </Card>
  )
}

function ManualAddPanel({ providerConfig, onChanged }: { providerConfig: LLMProviderConfig | null, onChanged: () => void }) {
  const [text, setText] = useState("")
  const [context, setContext] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const explanation = await generateLearningExplanation({ text, context, providerConfig })
      const parent = await upsertLearningItem({
        text,
        context,
        source: "manual",
        explanation,
      })
      const children = await extractLearningChildren({ text, context, providerConfig })
      await Promise.all(children.map(child => upsertLearningItem({
        text: child.text,
        kind: child.kind,
        context,
        source: "manual",
        parentId: parent.id,
        explanation: child.explanation,
        tags: child.tags,
      })))
      setText("")
      setContext("")
      onChanged()
      toast.success(children.length > 0 ? `已加入待学习库，并抽取 ${children.length} 个重点` : "已加入待学习库")
    }
    catch (error) {
      toast.error("保存失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>快速加入</CardTitle>
        <CardDescription>保存单词、短语、整句或段落；AI 可自动抽取子条目。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea value={text} onChange={event => setText(event.target.value)} placeholder="输入英文内容" />
        <Textarea value={context} onChange={event => setContext(event.target.value)} placeholder="可选：上下文或来源片段" />
        <div className="flex justify-end">
          <Button type="button" disabled={!text.trim() || isSaving} onClick={handleSave}>
            {isSaving ? "生成中..." : "加入"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewPanel({
  items,
  selectedItem,
  providerConfig,
  settings,
  onChanged,
}: {
  items: LearningItem[]
  selectedItem: LearningItem | undefined
  providerConfig: LLMProviderConfig | null
  settings: LearningSettings
  onChanged: () => void
}) {
  const reviewItems = useMemo(() => items.slice(0, 6), [items])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [material, setMaterial] = useState("")
  const [materialZh, setMaterialZh] = useState("")
  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [ratings, setRatings] = useState<Record<string, LearningReviewRating>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const generate = async () => {
    if (reviewItems.length === 0) {
      toast.info("今日暂无到期内容")
      return
    }

    setIsGenerating(true)
    try {
      const generated = await generateReviewMaterial({ items: reviewItems, providerConfig, mode: settings.reviewMode })
      const now = new Date()
      const nextSessionId = getRandomUUID()
      await db.reviewSessions.add({
        id: nextSessionId,
        createdAt: now,
        updatedAt: now,
        itemIds: reviewItems.map(item => item.id),
        title: generated.title,
        material: generated.material,
        materialZh: generated.materialZh,
        questions: generated.questions,
        answers: [],
        passed: false,
      })

      setSessionId(nextSessionId)
      setTitle(generated.title)
      setMaterial(generated.material)
      setMaterialZh(generated.materialZh ?? "")
      setQuestions(generated.questions)
      setAnswers({})
      setRatings({})
      onChanged()
    }
    catch (error) {
      toast.error("AI 复习材料生成失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsGenerating(false)
    }
  }

  const submit = async () => {
    if (!sessionId) {
      return
    }
    setIsSubmitting(true)
    try {
      const normalizedAnswers = questions.map(question => ({
        questionId: question.id,
        selectedAnswer: answers[question.id] ?? "",
        correct: answers[question.id] === question.answer,
      }))
      const correctCount = normalizedAnswers.filter(answer => answer.correct).length
      const passed = questions.length > 0 && correctCount / questions.length >= 0.75
      await db.reviewSessions.update(sessionId, {
        answers: normalizedAnswers,
        passed,
        updatedAt: new Date(),
      })

      await Promise.all(reviewItems.map((item) => {
        const rating = ratings[item.id] ?? (passed ? "good" : "again")
        return markLearningItemReviewRating(item.id, rating, {
          sessionId,
          desiredRetention: settings.desiredRetention,
        })
      }))
      onChanged()
      toast.success(passed ? "复习通过，FSRS 已更新下次复习时间" : "本次未通过，已安排更近复习")
    }
    catch (error) {
      toast.error("复习结果保存失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>AI 复习</CardTitle>
        <CardDescription>
          只使用今日到期内容生成
          {settings.reviewMode === "dialogue" ? "对话" : "短文"}
          和小测。
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" disabled={isGenerating || reviewItems.length === 0} onClick={generate}>
            <Icon icon="tabler:sparkles" />
            {isGenerating ? "生成中..." : "生成"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {reviewItems.length === 0
            ? <span className="text-sm text-muted-foreground">今日暂无到期内容。</span>
            : reviewItems.map(item => <Badge key={item.id} variant={selectedItem?.id === item.id ? "secondary" : "outline"}>{item.text}</Badge>)}
        </div>
        {material && (
          <>
            <Separator />
            <div>
              <h3 className="font-medium">{title}</h3>
              {materialZh && <p className="mt-1 text-sm text-muted-foreground">{materialZh}</p>}
            </div>
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-7">{material}</div>
            <div className="grid gap-3">
              {questions.map((question, index) => (
                <div key={question.id} className="rounded-lg border p-4">
                  <div className="font-medium">
                    Q
                    {index + 1}
                    .
                    {question.prompt}
                  </div>
                  <RadioGroup
                    className="mt-3 grid gap-2 md:grid-cols-2"
                    value={answers[question.id] ?? ""}
                    onValueChange={(value: unknown) => setAnswers(prev => ({ ...prev, [question.id]: String(value) }))}
                  >
                    {question.choices.map(choice => (
                      <label key={choice} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
                        <RadioGroupItem value={choice} />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </div>
            <div className="grid gap-2 rounded-lg border p-3">
              <div className="text-sm font-medium">手动校准记忆强度</div>
              {reviewItems.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{item.text}</span>
                  <div className="flex gap-1">
                    {RATING_OPTIONS.map(option => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={(ratings[item.id] ?? "good") === option.value ? "secondary" : "ghost"}
                        onClick={() => setRatings(prev => ({ ...prev, [item.id]: option.value }))}
                      >
                        <Icon icon={option.icon} />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={questions.length === 0 || Object.keys(answers).length < questions.length || isSubmitting}
                onClick={submit}
              >
                {isSubmitting ? "保存中..." : "提交"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function LibraryPanel({
  items,
  selectedId,
  onSelect,
  onChanged,
}: {
  items: LearningItem[]
  selectedId?: string
  onSelect: (item: LearningItem) => void
  onChanged: () => void
}) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<LearningItem["status"] | "all">("learning")
  const [kind, setKind] = useState<LearningItem["kind"] | "all">("all")
  const [source, setSource] = useState<LearningItem["source"] | "all">("all")
  const [dueOnly, setDueOnly] = useState(false)

  const filtered = items.filter((item) => {
    const matchesSearch = !search || item.text.toLowerCase().includes(search.toLowerCase()) || item.explanation?.meaningZh?.includes(search)
    const matchesStatus = status === "all" || item.status === status
    const matchesKind = kind === "all" || item.kind === kind
    const matchesSource = source === "all" || item.source === source
    const matchesDue = !dueOnly || dueTime(item) <= Date.now()
    return matchesSearch && matchesStatus && matchesKind && matchesSource && matchesDue
  })

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>知识库</CardTitle>
        <CardDescription>筛选、检索和管理所有学习内容。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索英文或中文解释" />
          <Select value={status} onValueChange={value => setStatus(value as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="learning">待学习</SelectItem>
              <SelectItem value="mastered">已掌握</SelectItem>
              <SelectItem value="archived">已归档</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={value => setKind(value as typeof kind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="word">单词</SelectItem>
              <SelectItem value="phrase">短语</SelectItem>
              <SelectItem value="sentence">句子</SelectItem>
              <SelectItem value="paragraph">段落</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={value => setSource(value as typeof source)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="vocab-test">词测</SelectItem>
              <SelectItem value="selection">划词</SelectItem>
              <SelectItem value="manual">手动</SelectItem>
              <SelectItem value="review">复习</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center justify-end gap-2 rounded-lg border px-3 text-sm">
            <Switch checked={dueOnly} onCheckedChange={setDueOnly} />
            到期
          </label>
        </div>
        <div className="grid gap-3">
          {filtered.length === 0
            ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Icon icon="tabler:database-search" />
                    </EmptyMedia>
                    <EmptyTitle>没有匹配内容</EmptyTitle>
                    <EmptyDescription>调整筛选条件或添加新内容。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            : filtered.map(item => (
                <LearningItemRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => onSelect(item)}
                  onChanged={onChanged}
                />
              ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailPanel({ item }: { item?: LearningItem }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>详情</CardTitle>
        <CardDescription>解释、来源和复习状态。</CardDescription>
      </CardHeader>
      <CardContent>
        {!item
          ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon icon="tabler:focus-centered" />
                  </EmptyMedia>
                  <EmptyTitle>选择一条内容</EmptyTitle>
                  <EmptyDescription>查看 AI 解释和来源上下文。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          : (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{item.text}</h3>
                    <ItemBadge item={item} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.kind}
                    {" "}
                    ·
                    {" "}
                    {item.source}
                  </p>
                </div>
                {item.explanation?.meaningZh && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">中文解释</div>
                    <p className="mt-1 text-sm leading-6">{item.explanation.meaningZh}</p>
                  </div>
                )}
                {item.explanation?.notes && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">易混点</div>
                    <p className="mt-1 text-sm leading-6">{item.explanation.notes}</p>
                  </div>
                )}
                {item.context && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">上下文</div>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-6">{item.context}</p>
                  </div>
                )}
                {item.sourceUrl && (
                  <a className="inline-flex items-center gap-1 text-sm underline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <Icon icon="tabler:external-link" />
                    打开来源
                  </a>
                )}
                <Separator />
                <DueMeta item={item} />
              </div>
            )}
      </CardContent>
    </Card>
  )
}

export function LearningPage() {
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const providerConfig = useMemo(() => getFirstEnabledLLMProvider(providersConfig), [providersConfig])
  const [data, setData] = useState<LearningDashboardData | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await loadLearningDashboardData()
    setData(next)
    setIsLoading(false)
    setSelectedId(current => current ?? next.items[0]?.id)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stats = data?.stats ?? { learning: 0, mastered: 0, archived: 0, total: 0 }
  const settings = data?.settings
  const items = data?.items ?? []
  const dueItems = settings ? getDueItems(items, settings) : []
  const selectedItem = items.find(item => item.id === selectedId)

  return (
    <PageLayout title="学习工作台" innerClassName="flex flex-col p-5 gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <StatTile label="今日到期" value={dueItems.length} tone="coral" icon="tabler:calendar-time" />
        <StatTile label="待学习" value={stats.learning} tone="mustard" icon="tabler:book-2" />
        <StatTile label="已掌握" value={stats.mastered} tone="olive" icon="tabler:circle-check" />
        <StatTile label="总知识" value={stats.total} tone="ink" icon="tabler:database" />
        <StatTile label="保留率" value={settings ? `${Math.round(settings.desiredRetention * 100)}%` : "90%"} tone="ink" icon="tabler:target" />
      </div>

      {!providerConfig && (
        <div className="rounded-lg border border-[#e9b94a]/40 bg-[#e9b94a]/10 p-3 text-sm text-[#70510d]">
          尚未启用 LLM 提供商。词测和本地保存可用，AI 解释与复习会使用简化结果。
        </div>
      )}

      {isLoading
        ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">加载中...</div>
        : (
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
              <div className="grid content-start gap-4">
                <ReviewQueue items={dueItems} selectedId={selectedId} onSelect={item => setSelectedId(item.id)} />
                <ManualAddPanel providerConfig={providerConfig} onChanged={refresh} />
              </div>
              <div className="grid content-start gap-4">
                <ReviewPanel
                  items={dueItems}
                  selectedItem={selectedItem}
                  providerConfig={providerConfig}
                  settings={settings!}
                  onChanged={refresh}
                />
                <VocabTestPanel providerConfig={providerConfig} onChanged={refresh} />
                <LibraryPanel
                  items={items}
                  selectedId={selectedId}
                  onSelect={item => setSelectedId(item.id)}
                  onChanged={refresh}
                />
              </div>
              <DetailPanel item={selectedItem} />
            </div>
          )}
    </PageLayout>
  )
}

function LearningPreferencesPanel({ settings, onChanged }: { settings: LearningSettings, onChanged: () => void }) {
  const [selectionToolbar, setSelectionToolbar] = useAtom(configFieldsAtomMap.selectionToolbar)
  const [desiredRetention, setDesiredRetention] = useState(String(settings.desiredRetention))

  const save = async (patch: Partial<Omit<LearningSettings, "id" | "updatedAt">>) => {
    await saveLearningSettings(patch)
    onChanged()
  }

  const setLearningToolbarEnabled = (enabled: boolean) => {
    void setSelectionToolbar({
      ...selectionToolbar,
      features: {
        ...selectionToolbar.features,
        learning: {
          enabled,
        },
      },
    })
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>学习偏好</CardTitle>
        <CardDescription>FSRS、复习材料和划词保存。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>目标保留率</span>
            <Input
              value={desiredRetention}
              onChange={event => setDesiredRetention(event.target.value)}
              onBlur={() => void save({ desiredRetention: Number(desiredRetention) || 0.9 })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>复习材料</span>
            <Select value={settings.reviewMode} onValueChange={value => void save({ reviewMode: value as LearningSettings["reviewMode"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="story">短文</SelectItem>
                <SelectItem value="dialogue">对话</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <Separator />
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">巩固已掌握内容</div>
              <div className="text-xs text-muted-foreground">开启后已掌握内容也会按 FSRS 到期进入今日队列。</div>
            </div>
            <Switch checked={settings.includeMasteredInReview} onCheckedChange={checked => void save({ includeMasteredInReview: checked })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">划词加入待学习</div>
              <div className="text-xs text-muted-foreground">控制选中文本工具栏里的书签按钮。</div>
            </div>
            <Switch checked={selectionToolbar.features.learning?.enabled ?? true} onCheckedChange={setLearningToolbarEnabled} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ImportExportPanel({ onChanged }: { onChanged: () => void }) {
  const exportJson = async () => {
    const data = await exportLearningData()
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `read-frog-learning-data-v${data.schemaVersion}.json`)
    toast.success("学习数据已导出")
  }

  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) {
      return
    }
    const text = await file.text()
    await mergeLearningData(JSON.parse(text))
    onChanged()
    toast.success("学习数据已导入")
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>本地备份</CardTitle>
        <CardDescription>GitHub 同步失败时可手动导入导出 JSON。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void exportJson()}>
          <Icon icon="tabler:file-export" />
          导出 JSON
        </Button>
        <Button type="button" variant="outline" className="p-0">
          <Label htmlFor="import-learning-data" className="flex h-full cursor-pointer items-center gap-2 px-3">
            <Icon icon="tabler:file-import" />
            导入 JSON
          </Label>
          <Input id="import-learning-data" type="file" className="hidden" accept=".json" onChange={event => void importJson(event)} />
        </Button>
      </CardContent>
    </Card>
  )
}

function GithubSyncPanel({ syncConfig, onChanged }: { syncConfig: GithubLearningSyncConfig | undefined, onChanged: () => void }) {
  const [owner, setOwner] = useState(syncConfig?.owner ?? DEFAULT_SYNC.owner)
  const [repo, setRepo] = useState(syncConfig?.repo ?? DEFAULT_SYNC.repo)
  const [branch, setBranch] = useState(syncConfig?.branch ?? DEFAULT_SYNC.branch)
  const [path, setPath] = useState(syncConfig?.path ?? DEFAULT_SYNC.path)
  const [token, setToken] = useState(syncConfig?.token ?? "")
  const [clientId, setClientId] = useState(syncConfig?.clientId ?? "")
  const [deviceCode, setDeviceCode] = useState("")
  const [userCode, setUserCode] = useState("")
  const [verificationUri, setVerificationUri] = useState("")
  const [isBusy, setIsBusy] = useState(false)

  const saveConfig = async (nextToken = token) => {
    await saveGithubLearningSyncConfig({
      owner,
      repo,
      branch,
      path,
      token: nextToken,
      clientId,
      lastSyncAt: syncConfig?.lastSyncAt,
    })
    onChanged()
  }

  const startDeviceFlow = async () => {
    if (!clientId.trim()) {
      toast.error("需要 GitHub OAuth App Client ID")
      return
    }
    setIsBusy(true)
    try {
      const result = await requestGithubDeviceCode(clientId.trim())
      setDeviceCode(result.device_code)
      setUserCode(result.user_code)
      setVerificationUri(result.verification_uri)
      toast.info("打开 GitHub 验证页面并输入设备码")
    }
    catch (error) {
      toast.error("GitHub OAuth 启动失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsBusy(false)
    }
  }

  const pollToken = async () => {
    if (!deviceCode) {
      return
    }
    setIsBusy(true)
    try {
      const result = await pollGithubDeviceToken({ clientId: clientId.trim(), deviceCode })
      if (!result.access_token) {
        throw new Error(result.error_description ?? result.error ?? "GitHub authorization is not ready")
      }
      setToken(result.access_token)
      await saveConfig(result.access_token)
      toast.success("GitHub 授权已保存")
    }
    catch (error) {
      toast.error("GitHub 授权确认失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsBusy(false)
    }
  }

  const createRepo = async () => {
    setIsBusy(true)
    try {
      await saveConfig()
      await createPrivateLearningDataRepo({ token, repo })
      toast.success("私有学习数据仓库已创建")
      onChanged()
    }
    catch (error) {
      toast.error("创建仓库失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsBusy(false)
    }
  }

  const sync = async () => {
    setIsBusy(true)
    try {
      await saveConfig()
      await syncLearningDataToGithub()
      toast.success("学习数据已同步到 GitHub")
      onChanged()
    }
    catch (error) {
      toast.error("同步失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsBusy(false)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>GitHub 私有仓库同步</CardTitle>
        <CardDescription>IndexedDB 是主库，GitHub 用作备份和跨设备同步。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>Owner</span>
            <Input value={owner} onChange={event => setOwner(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Repo</span>
            <Input value={repo} onChange={event => setRepo(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Branch</span>
            <Input value={branch} onChange={event => setBranch(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Data path</span>
            <Input value={path} onChange={event => setPath(event.target.value)} />
          </label>
        </div>
        <Separator />
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span>GitHub OAuth App Client ID</span>
            <Input value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Device Flow Client ID" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={isBusy} onClick={startDeviceFlow}>
              <Icon icon="tabler:brand-github" />
              获取设备码
            </Button>
            <Button type="button" variant="outline" disabled={isBusy || !deviceCode} onClick={pollToken}>
              确认授权
            </Button>
          </div>
          {userCode && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              在浏览器打开
              {" "}
              <a className="underline" href={verificationUri} target="_blank" rel="noopener noreferrer">{verificationUri}</a>
              ，输入设备码
              {" "}
              <span className="font-mono font-semibold">{userCode}</span>
              。
            </div>
          )}
          <label className="grid gap-1 text-sm">
            <span>Access token</span>
            <Input value={token} onChange={event => setToken(event.target.value)} type="password" placeholder="也可以直接粘贴 fine-grained token" />
          </label>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            最后同步：
            {syncConfig?.lastSyncAt ? syncConfig.lastSyncAt.toLocaleString() : "尚未同步"}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={isBusy || !token} onClick={createRepo}>
              创建私有仓库
            </Button>
            <Button type="button" disabled={isBusy || !token} onClick={sync}>
              {isBusy ? "处理中..." : "同步"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function LearningSettingsPage() {
  const [data, setData] = useState<LearningSettingsData | null>(null)

  const refresh = useCallback(async () => {
    setData(await loadLearningSettingsData())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <PageLayout title="学习设置" innerClassName="flex flex-col p-5 gap-4">
      {data
        ? (
            <>
              <LearningPreferencesPanel settings={data.settings} onChanged={refresh} />
              <ImportExportPanel onChanged={refresh} />
              <GithubSyncPanel
                key={data.syncConfig?.updatedAt.getTime() ?? "empty-sync-config"}
                syncConfig={data.syncConfig}
                onChanged={refresh}
              />
            </>
          )
        : <div className="rounded-lg border p-6 text-sm text-muted-foreground">加载中...</div>}
    </PageLayout>
  )
}
