import type { LearningBridgeConfig, LearningBridgeStatus } from "@/utils/learning-bridge"
import { Icon } from "@iconify/react"
import { useAtom } from "jotai"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/base-ui/card"
import { Input } from "@/components/ui/base-ui/input"
import { Separator } from "@/components/ui/base-ui/separator"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLearningBridgeConfig, saveLearningBridgeConfig } from "@/utils/learning-bridge"
import { LEARNING_DAEMON_DEFAULT_BASE_URL } from "@/utils/learning-contracts"
import { sendMessage } from "@/utils/message"
import { cn } from "@/utils/styles/utils"
import { PageLayout } from "../../components/page-layout"

type StatusTone = "connected" | "offline" | "disabled" | "incompatible" | "unauthorized"

const STATUS_LABEL: Record<StatusTone, string> = {
  connected: "Connected",
  offline: "Offline",
  disabled: "Disabled",
  incompatible: "Incompatible",
  unauthorized: "Unauthorized",
}

function getStatusTone(status: LearningBridgeStatus | null, config: LearningBridgeConfig | null): StatusTone {
  if (status?.state) {
    return status.state
  }
  if (config && !config.enabled) {
    return "disabled"
  }
  return "offline"
}

function statusClassName(tone: StatusTone) {
  return {
    connected: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
    offline: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
    disabled: "border-muted-foreground/30 bg-muted text-muted-foreground",
    incompatible: "border-orange-600/30 bg-orange-600/10 text-orange-800 dark:text-orange-300",
    unauthorized: "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300",
  }[tone]
}

function LearningToggleRows() {
  const [selectionToolbar, setSelectionToolbar] = useAtom(configFieldsAtomMap.selectionToolbar)
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const learningMode = translateConfig.page.learningMode ?? {
    enabled: false,
    maxTermsPerParagraph: 6,
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

  const setLearningTranslationEnabled = (enabled: boolean) => {
    void setTranslateConfig({
      ...translateConfig,
      page: {
        ...translateConfig.page,
        learningMode: {
          ...learningMode,
          enabled,
        },
      },
    })
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4 rounded-md border border-border/70 bg-background p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Selection capture</div>
          <div className="text-xs text-muted-foreground">Show the learning save action in the selection toolbar.</div>
        </div>
        <Switch checked={selectionToolbar.features.learning?.enabled ?? true} onCheckedChange={setLearningToolbarEnabled} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border border-border/70 bg-background p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Selective translation</div>
          <div className="text-xs text-muted-foreground">Use mastery projection from the daemon to avoid translating mastered terms.</div>
        </div>
        <Switch checked={learningMode.enabled} onCheckedChange={setLearningTranslationEnabled} />
      </div>
    </div>
  )
}

function WorkspaceBridge({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const [config, setConfig] = useState<LearningBridgeConfig | null>(null)
  const [baseUrlDraft, setBaseUrlDraft] = useState(LEARNING_DAEMON_DEFAULT_BASE_URL)
  const [status, setStatus] = useState<LearningBridgeStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const workspaceUrl = useMemo(() => {
    return (config?.baseUrl || baseUrlDraft || LEARNING_DAEMON_DEFAULT_BASE_URL).replace(/\/+$/, "")
  }, [baseUrlDraft, config?.baseUrl])
  const tone = getStatusTone(status, config)

  const refresh = useCallback(async () => {
    setIsBusy(true)
    try {
      const nextConfig = await getLearningBridgeConfig()
      const nextStatus = await sendMessage("getLearningBridgeStatus", undefined)
      setConfig(nextConfig)
      setBaseUrlDraft(nextConfig.baseUrl)
      setStatus(nextStatus)
    }
    catch (error) {
      setStatus({
        state: "offline",
        connected: false,
        pendingCaptureCount: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    finally {
      setIsBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveConfig = async (patch: Partial<LearningBridgeConfig>) => {
    const current = config ?? await getLearningBridgeConfig()
    const next = {
      ...current,
      ...patch,
      baseUrl: patch.baseUrl?.trim() || current.baseUrl || LEARNING_DAEMON_DEFAULT_BASE_URL,
    }
    await saveLearningBridgeConfig(next)
    setConfig(next)
    setBaseUrlDraft(next.baseUrl)
    await refresh()
  }

  const openWorkspace = async () => {
    await sendMessage("openPage", {
      url: workspaceUrl,
      active: true,
    })
  }

  const flushQueue = async () => {
    setIsBusy(true)
    try {
      const result = await sendMessage("flushLearningBridgeQueue", undefined)
      if (result.status === "flushed") {
        toast.success("Learning queue flushed")
      }
      else {
        toast.error("Learning queue not flushed", {
          description: result.error,
        })
      }
      await refresh()
    }
    finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <CardAction>
            <Badge variant="outline" className={cn("rounded-md border px-2 py-1", statusClassName(tone))}>
              {STATUS_LABEL[tone]}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Workspace URL</span>
              <Input
                value={baseUrlDraft}
                onChange={event => setBaseUrlDraft(event.target.value)}
                onBlur={() => void saveConfig({ baseUrl: baseUrlDraft })}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" disabled={isBusy} onClick={() => void refresh()}>
                <Icon icon="tabler:refresh" />
                Refresh
              </Button>
              <Button type="button" disabled={isBusy} onClick={() => void openWorkspace()}>
                <Icon icon="tabler:external-link" />
                Open
              </Button>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Projection</div>
              <div className="mt-1 truncate font-mono text-sm">{status?.daemon?.projectionVersion ?? "unknown"}</div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Pending captures</div>
              <div className="mt-1 font-mono text-sm">{status?.pendingCaptureCount ?? 0}</div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Contract</div>
              <div className="mt-1 font-mono text-sm">{status?.daemon?.contractVersion ?? "unknown"}</div>
            </div>
          </div>
          {status?.error && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              {status.error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Bridge Controls</CardTitle>
          <CardDescription>Keep extension-side learning narrow: capture, sync, and projection lookup.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border/70 bg-background p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Daemon bridge</div>
              <div className="text-xs text-muted-foreground">Disable only when using extension-local fallback data.</div>
            </div>
            <Switch checked={config?.enabled ?? true} onCheckedChange={checked => void saveConfig({ enabled: checked })} />
          </div>
          <Button type="button" variant="outline" disabled={isBusy || (status?.pendingCaptureCount ?? 0) === 0} onClick={() => void flushQueue()}>
            <Icon icon="tabler:cloud-upload" />
            Flush capture queue
          </Button>
          <LearningToggleRows />
        </CardContent>
      </Card>
    </div>
  )
}

export function LearningPage() {
  return (
    <PageLayout title="Learning" innerClassName="flex flex-col p-5 gap-4">
      <WorkspaceBridge
        title="Learning Workspace"
        description="The full learning cockpit now runs in the local daemon/container. The extension keeps only capture, page translation, and bridge controls here."
      />
    </PageLayout>
  )
}

export function LearningSettingsPage() {
  return (
    <PageLayout title="Learning Settings" innerClassName="flex flex-col p-5 gap-4">
      <WorkspaceBridge
        title="Learning Bridge Settings"
        description="Configure how the extension reaches the daemon-hosted workspace and how learning data affects selection capture and translation."
      />
    </PageLayout>
  )
}
