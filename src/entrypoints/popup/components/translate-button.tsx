import { useAtom, useAtomValue } from "jotai"
import { browser, i18n } from "#imports"
import { Button } from "@/components/ui/base-ui/button"
import { ANALYTICS_FEATURE, ANALYTICS_SURFACE } from "@/types/analytics"
import { createFeatureUsageContext } from "@/utils/analytics"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { sendMessage } from "@/utils/message"
import { formatHotkey } from "@/utils/os.ts"
import { isPageTranslationShortcutEmpty } from "@/utils/page-translation-shortcut"
import { cn } from "@/utils/styles/utils"
import { isPageTranslatedAtom } from "../atoms/auto-translate"
import { isIgnoreTabAtom } from "../atoms/ignore"
import { isCurrentSiteInBlacklistAtom, isCurrentSiteInWhitelistAtom } from "../atoms/site-control"

export default function TranslateButton({ className }: { className?: string }) {
  const [isPageTranslated, setIsPageTranslated] = useAtom(isPageTranslatedAtom)
  const isIgnoreTab = useAtomValue(isIgnoreTabAtom)
  const translateConfig = useAtomValue(configFieldsAtomMap.translate)
  const { mode } = useAtomValue(configFieldsAtomMap.siteControl)
  const isCurrentSiteInWhitelist = useAtomValue(isCurrentSiteInWhitelistAtom)
  const isCurrentSiteInBlacklist = useAtomValue(isCurrentSiteInBlacklistAtom)

  const toggleTranslation = async () => {
    const [currentTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })

    if (typeof currentTab?.id !== "number")
      return

    const nextEnabled = !isPageTranslated
    void sendMessage("tryToSetEnablePageTranslationByTabId", {
      tabId: currentTab.id,
      enabled: nextEnabled,
      analyticsContext: nextEnabled
        ? createFeatureUsageContext(ANALYTICS_FEATURE.PAGE_TRANSLATION, ANALYTICS_SURFACE.POPUP)
        : undefined,
    })

    setIsPageTranslated(prev => !prev)
  }

  const isSiteBlocked = mode === "whitelist" ? !isCurrentSiteInWhitelist : isCurrentSiteInBlacklist
  const isDisabled = isIgnoreTab || isSiteBlocked
  const disabledReason = isIgnoreTab
    ? "当前页面不可翻译"
    : isSiteBlocked
      ? "此网站已被站点规则禁用"
      : undefined
  const formattedShortcut = formatHotkey(translateConfig.page.shortcut)
  const shortcutSuffix = isPageTranslationShortcutEmpty(translateConfig.page.shortcut) ? "" : ` (${formattedShortcut})`

  return (
    <Button
      onClick={toggleTranslation}
      disabled={isDisabled}
      title={disabledReason}
      className={cn(
        "block truncate",
        className,
      )}
    >
      {disabledReason ?? (isPageTranslated
        ? i18n.t("popup.showOriginal")
        : `${i18n.t("popup.translate")}${shortcutSuffix}`)}
    </Button>
  )
}
