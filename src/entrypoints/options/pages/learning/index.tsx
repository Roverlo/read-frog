import type { GithubLearningSyncConfig, LearningItem, ReviewQuestion, VocabQuestion } from "@/types/learning"
import type { LLMProviderConfig, ProvidersConfig } from "@/types/config/provider"
import { Icon } from "@iconify/react"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/base-ui/card"
import { Input } from "@/components/ui/base-ui/input"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/base-ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/base-ui/radio-group"
import { Separator } from "@/components/ui/base-ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/base-ui/tabs"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { isLLMProviderConfig } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { db } from "@/utils/db/dexie/db"
import { generateLearningExplanation, generateReviewMaterial } from "@/utils/learning/ai"
import { createPrivateLearningDataRepo, getGithubLearningSyncConfig, pollGithubDeviceToken, requestGithubDeviceCode, saveGithubLearningSyncConfig, syncLearningDataToGithub } from "@/utils/learning/github-sync"
import { getLearningStats, markLearningItemReviewResult, upsertLearningItem } from "@/utils/learning/items"
import { createVocabQuestions, estimateVocabularySize } from "@/utils/learning/vocab-test"
import { cn } from "@/utils/styles/utils"
import { PageLayout } from "../../components/page-layout"

interface LearningDashboardData {
  items: LearningItem[]
  stats: Awaited<ReturnType<typeof getLearningStats>>
  syncConfig: GithubLearningSyncConfig | undefined
}

const DEFAULT_SYNC = {
  owner: "Roverlo",
  repo: "read-frog-learning-data",
  branch: "main",
  path: "read-frog-learning-data.json",
}

function getFirstEnabledLLMProvider(providersConfig: ProvidersConfig): LLMProviderConfig | null {
  return providersConfig.find((provider): provider is LLMProviderConfig =>
    isLLMProviderConfig(provider) && provider.enabled,
  ) ?? null
}

async function loadLearningDashboardData(): Promise<LearningDashboardData> {
  const [items, stats, syncConfig] = await Promise.all([
    db.learningItems.orderBy("updatedAt").reverse().toArray(),
    getLearningStats(),
    getGithubLearningSyncConfig(),
  ])
  return { items, stats, syncConfig }
}

function StatTile({ label, value, tone }: { label: string, value: number, tone: "coral" | "mustard" | "olive" | "ink" }) {
  const toneClass = {
    coral: "border-[#ed6f5c]/30 bg-[#ed6f5c]/10 text-[#8c3328]",
    mustard: "border-[#e9b94a]/40 bg-[#e9b94a]/10 text-[#70510d]",
    olive: "border-[#6e7448]/35 bg-[#6e7448]/10 text-[#3f4424]",
    ink: "border-foreground/15 bg-muted/40 text-foreground",
  }[tone]

  return (
    <div className={cn("rounded-lg border p-4", toneClass)}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] opacity-75">{label}</div>
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

function LearningItemRow({ item, onChanged }: { item: LearningItem, onChanged: () => void }) {
  const handleMaster = async () => {
    await db.learningItems.put({
      ...item,
      status: "mastered",
      consecutivePasses: Math.max(item.consecutivePasses, 2),
      masteredAt: item.masteredAt ?? new Date(),
      updatedAt: new Date(),
    })
    onChanged()
  }

  const handleArchive = async () => {
    await db.learningItems.put({
      ...item,
      status: "archived",
      updatedAt: new Date(),
    })
    onChanged()
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-card/70 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.text}</span>
          <ItemBadge item={item} />
          <Badge variant="outline" size="sm">{item.kind}</Badge>
        </div>
        {item.explanation?.meaningZh && (
          <p className="mt-2 text-sm text-muted-foreground">{item.explanation.meaningZh}</p>
        )}
        {item.context && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.context}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>通过 {item.consecutivePasses}/2</span>
          <span>复习 {item.reviewCount}</span>
          <span>{item.updatedAt.toLocaleString()}</span>
        </div>
      </div>
      <div className="flex items-start gap-2">
        {item.status !== "mastered" && (
          <Button type="button" size="sm" variant="outline" onClick={handleMaster}>
            <Icon icon="tabler:check" />
            掌握
          </Button>
        )}
        {item.status !== "archived" && (
          <Button type="button" size="sm" variant="ghost" onClick={handleArchive}>
            <Icon icon="tabler:archive" />
            归档
          </Button>
        )}
      </div>
    </div>
  )
}

function VocabTestPanel({ providerConfig, onChanged }: { providerConfig: LLMProviderConfig | null, onChanged: () => void }) {
  const [questions, setQuestions] = useState<VocabQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ correct: number, total: number, estimated: number } | null>(null)

  const startTest = () => {
    setQuestions(createVocabQuestions(12))
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
        })
      }

      setResult({ correct: correctQuestionIds.size, total: questions.length, estimated })
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
        <CardDescription>英文词选择中文释义。答对进入已掌握，答错进入待学习。</CardDescription>
        <CardAction>
          <Button type="button" size="sm" onClick={startTest}>
            <Icon icon="tabler:cards" />
            开始测试
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            点击开始后生成 12 道分级词汇题。
          </div>
        ) : (
          <>
            <Progress value={(Object.keys(answers).length / questions.length) * 100}>
              <ProgressLabel>完成进度</ProgressLabel>
              <ProgressValue>{Object.keys(answers).length}/{questions.length}</ProgressValue>
            </Progress>
            <div className="grid gap-3">
              {questions.map((question, index) => (
                <div key={question.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Q{index + 1}</span>
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
            <div className="flex items-center justify-between">
              {result ? (
                <div className="text-sm">
                  答对 {result.correct}/{result.total}，估算词汇量约 {result.estimated.toLocaleString()}。
                </div>
              ) : <span />}
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
      await upsertLearningItem({
        text,
        context,
        source: "manual",
        explanation,
      })
      setText("")
      setContext("")
      onChanged()
      toast.success("已加入待学习库")
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
        <CardTitle>手动加入待学习</CardTitle>
        <CardDescription>可以保存单词、短语、整句或段落。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea value={text} onChange={event => setText(event.target.value)} placeholder="输入英文内容" />
        <Textarea value={context} onChange={event => setContext(event.target.value)} placeholder="可选：上下文或来源片段" />
        <div className="flex justify-end">
          <Button type="button" disabled={!text.trim() || isSaving} onClick={handleSave}>
            {isSaving ? "生成解释中..." : "加入待学习"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewPanel({ items, providerConfig, onChanged }: { items: LearningItem[], providerConfig: LLMProviderConfig | null, onChanged: () => void }) {
  const reviewItems = useMemo(() => items.filter(item => item.status === "learning").slice(0, 6), [items])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [material, setMaterial] = useState("")
  const [materialZh, setMaterialZh] = useState("")
  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const generate = async () => {
    if (reviewItems.length === 0) {
      toast.info("待学习库为空")
      return
    }

    setIsGenerating(true)
    try {
      const generated = await generateReviewMaterial({ items: reviewItems, providerConfig })
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
      await Promise.all(reviewItems.map(item => markLearningItemReviewResult(item.id, passed)))
      onChanged()
      toast.success(passed ? "复习通过，连续通过 2 次后会进入已掌握库" : "本次未通过，明天再复习")
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
    <div className="grid gap-4">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>AI 复习</CardTitle>
          <CardDescription>用待学习内容生成短文或对话，再完成小测。</CardDescription>
          <CardAction>
            <Button type="button" size="sm" disabled={isGenerating || reviewItems.length === 0} onClick={generate}>
              <Icon icon="tabler:sparkles" />
              {isGenerating ? "生成中..." : "生成复习"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {reviewItems.length === 0
              ? <span className="text-sm text-muted-foreground">待学习库暂无内容。</span>
              : reviewItems.map(item => <Badge key={item.id} variant="outline">{item.text}</Badge>)}
          </div>
        </CardContent>
      </Card>

      {material && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {materialZh && <CardDescription>{materialZh}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-7">{material}</div>
            <div className="grid gap-3">
              {questions.map((question, index) => (
                <div key={question.id} className="rounded-lg border p-4">
                  <div className="font-medium">Q{index + 1}. {question.prompt}</div>
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
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={questions.length === 0 || Object.keys(answers).length < questions.length || isSubmitting}
                onClick={submit}
              >
                {isSubmitting ? "保存中..." : "提交复习测试"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function LibraryPanel({ items, status, onChanged }: { items: LearningItem[], status: LearningItem["status"], onChanged: () => void }) {
  const filtered = items.filter(item => item.status === status)
  return (
    <div className="grid gap-3">
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          暂无内容。
        </div>
      ) : filtered.map(item => (
        <LearningItemRow key={item.id} item={item} onChanged={onChanged} />
      ))}
    </div>
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

  useEffect(() => {
    setOwner(syncConfig?.owner ?? DEFAULT_SYNC.owner)
    setRepo(syncConfig?.repo ?? DEFAULT_SYNC.repo)
    setBranch(syncConfig?.branch ?? DEFAULT_SYNC.branch)
    setPath(syncConfig?.path ?? DEFAULT_SYNC.path)
    setToken(syncConfig?.token ?? "")
    setClientId(syncConfig?.clientId ?? "")
  }, [syncConfig])

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
      await createPrivateLearningDataRepo({
        token,
        repo,
      })
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
        <CardDescription>本地 IndexedDB 是主库，GitHub 用作备份和跨设备同步。</CardDescription>
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
              在浏览器打开 <a className="underline" href={verificationUri} target="_blank" rel="noopener noreferrer">{verificationUri}</a>，输入设备码 <span className="font-mono font-semibold">{userCode}</span>。
            </div>
          )}
          <label className="grid gap-1 text-sm">
            <span>Access token</span>
            <Input value={token} onChange={event => setToken(event.target.value)} type="password" placeholder="也可以直接粘贴 fine-grained token" />
          </label>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            最后同步：{syncConfig?.lastSyncAt ? syncConfig.lastSyncAt.toLocaleString() : "尚未同步"}
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

export function LearningPage() {
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const providerConfig = useMemo(() => getFirstEnabledLLMProvider(providersConfig), [providersConfig])
  const [data, setData] = useState<LearningDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setData(await loadLearningDashboardData())
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stats = data?.stats ?? { learning: 0, mastered: 0, archived: 0, total: 0 }
  const items = data?.items ?? []

  return (
    <PageLayout
      title="学习"
      innerClassName="flex flex-col p-6 gap-5"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <StatTile label="总知识" value={stats.total} tone="ink" />
        <StatTile label="待学习" value={stats.learning} tone="coral" />
        <StatTile label="已掌握" value={stats.mastered} tone="olive" />
        <StatTile label="已归档" value={stats.archived} tone="mustard" />
      </div>

      {!providerConfig && (
        <div className="rounded-lg border border-[#e9b94a]/40 bg-[#e9b94a]/10 p-3 text-sm text-[#70510d]">
          尚未启用 LLM 提供商。词测和本地保存可用，AI 解释与复习会使用简化结果。
        </div>
      )}

      <Tabs defaultValue="vocab" className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto rounded-lg bg-muted/60 p-1">
          <TabsTrigger value="vocab">词测</TabsTrigger>
          <TabsTrigger value="learning">待学习</TabsTrigger>
          <TabsTrigger value="review">复习</TabsTrigger>
          <TabsTrigger value="mastered">已掌握</TabsTrigger>
          <TabsTrigger value="sync">同步</TabsTrigger>
        </TabsList>

        <TabsContent value="vocab" className="grid gap-4">
          <VocabTestPanel providerConfig={providerConfig} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="learning" className="grid gap-4">
          <ManualAddPanel providerConfig={providerConfig} onChanged={refresh} />
          {isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : <LibraryPanel items={items} status="learning" onChanged={refresh} />}
        </TabsContent>
        <TabsContent value="review">
          <ReviewPanel items={items} providerConfig={providerConfig} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="mastered">
          {isLoading ? <div className="text-sm text-muted-foreground">加载中...</div> : <LibraryPanel items={items} status="mastered" onChanged={refresh} />}
        </TabsContent>
        <TabsContent value="sync">
          <GithubSyncPanel syncConfig={data?.syncConfig} onChanged={refresh} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
