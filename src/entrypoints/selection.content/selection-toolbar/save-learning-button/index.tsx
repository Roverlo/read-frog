import type { LLMProviderConfig } from "@/types/config/provider"
import { IconBookmark, IconLoader2 } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { isLLMProviderConfig } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { extractLearningChildren, generateLearningExplanation } from "@/utils/learning/ai"
import { upsertLearningItem } from "@/utils/learning/items"
import { SelectionToolbarTooltip, useSelectionTooltipState } from "../../components/selection-tooltip"
import { selectionSessionAtom } from "../atoms"

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

      const parent = await upsertLearningItem({
        text,
        context,
        source: "selection",
        sourceTitle: document.title || undefined,
        sourceUrl: location.href,
        explanation,
      })
      const children = await extractLearningChildren({
        text,
        context,
        providerConfig,
      })
      await Promise.all(children.map(child => upsertLearningItem({
        text: child.text,
        kind: child.kind,
        context,
        source: "selection",
        sourceTitle: document.title || undefined,
        sourceUrl: location.href,
        parentId: parent.id,
        explanation: child.explanation,
        tags: child.tags,
      })))

      toast.success(children.length > 0 ? `已加入待学习库，并抽取 ${children.length} 个重点` : "已加入待学习库")
    }
    catch (error) {
      toast.error("保存到待学习库失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    finally {
      setIsSaving(false)
    }
  }, [handlePress, isSaving, providerConfig, selectionSession])

  const tooltipText = isSaving ? "保存中..." : "加入待学习"

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
