import { Icon } from "@iconify/react"
import { useAtom } from "jotai"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { openOptionsPage } from "@/utils/navigation"

export function LearningTranslationToggle() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const learningMode = translateConfig.page.learningMode ?? {
    enabled: false,
    maxTermsPerParagraph: 6,
  }

  const setEnabled = (checked: boolean) => {
    void setTranslateConfig({
      ...translateConfig,
      page: {
        ...translateConfig.page,
        learningMode: {
          ...learningMode,
          enabled: checked,
        },
      },
    })
  }

  return (
    <div className="rounded-lg border border-[#6e7448]/25 bg-[#6e7448]/8 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex items-center gap-2 text-left"
          onClick={() => void openOptionsPage("/learning")}
          title="打开学习工作台"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#6e7448]/14 text-[#3f4424] dark:text-[#d8dfaa]">
            <Icon icon="tabler:target-arrow" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">学习翻译</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              只提示未掌握词
            </span>
          </span>
        </button>
        <Switch checked={learningMode.enabled} onCheckedChange={setEnabled} />
      </div>
    </div>
  )
}
