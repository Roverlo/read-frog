import type { LLMProviderConfig } from "@/types/config/provider"
import { IconBookmark, IconLoader2 } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { isLLMProviderConfig } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { extractLearningChildren, generateLearningExplanation } from "@/utils/learning/ai"
import { sendMessage } from "@/utils/message"
import { SelectionToolbarTooltip, useSelectionTooltipState } from "../../components/selection-tooltip"
import { selectionSessionAtom } from "../atoms"

function getSavedMessage(childCount: number) {
  return childCount > 0
    ? `已同步到学习容器，并抽取 ${childCount} 个重点`
    : "已同步到学习容器"
}

function getQueuedMessage(childCount: number) {
  return childCount > 0
    ? `学习容器离线，已加入待同步队列，并抽取 ${childCount} 个重点`
    : "学习容器离线，已加入待同步队列"
}

export function SaveLearningButton() {
  const selectionSession = useAtomValue(selectionSessionAtom)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const [isSaving, setIsSaving] = useState(false)
  const { handlePress, onOpenChange: handleTooltipOpenChange, open: tooltipOpen } = useSelectionTooltipState()
  const providerConfig = useMemo(
    () => providersConfig.find((provider): provider is LLMProviderConfig =>
      provider.enabled && isLLMProviderConfig(provider),
    ) ?? null,
    [providersConfig],
  )

  const handleClick = useCallback(async () => {
    if (!selectionSession || isSaving) {
      return
    }

    handlePress()
    setIsSaving(true)

    try {
      const text = selectionSession.selectionSnapshot.text
      const context = selectionSession.contextSnapshot.text
      const explanation = await generateLearningExplanation({
        text,
        context,
        providerConfig,
      })
      const children = await extractLearningChildren({
        text,
        context,
        providerConfig,
      })

      const result = await sendMessage("syncLearningCaptureSelection", {
        text,
        context,
        sourceTitle: document.title || undefined,
        sourceUrl: location.href,
        explanation,
        extractedItems: children.map(child => ({
          text: child.text,
          kind: child.kind,
          explanation: child.explanation,
          tags: child.tags,
        })),
      })

      if (result.status === "synced") {
        toast.success(getSavedMessage(children.length))
      }
      else if (result.status === "queued") {
        toast.success(getQueuedMessage(children.length))
      }
      else {
        toast.error("学习容器桥接已关闭")
      }
    }
    catch (error) {
      toast.error("保存到学习容器失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsSaving(false)
    }
  }, [handlePress, isSaving, providerConfig, selectionSession])

  const tooltipText = isSaving ? "保存中..." : "加入学习容器"

  return (
    <SelectionToolbarTooltip
      content={tooltipText}
      open={tooltipOpen}
      onOpenChange={handleTooltipOpenChange}
      render={(
        <button
          type="button"
          className="px-2 h-7 flex items-center justify-center hover:bg-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleClick}
          disabled={isSaving || !selectionSession}
          aria-label={tooltipText}
        />
      )}
    >
      {isSaving
        ? <IconLoader2 className="size-4.5 animate-spin" strokeWidth={1.6} />
        : <IconBookmark className="size-4.5" strokeWidth={1.6} />}
    </SelectionToolbarTooltip>
  )
}
