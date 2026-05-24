import { useAtom, useAtomValue } from "jotai"
import { useMemo } from "react"
import { i18n } from "#imports"
import { HelpTooltip } from "@/components/help-tooltip"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { isNonAPIProviderConfig, isTranslateProvider } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { filterEnabledProvidersConfig } from "@/utils/config/helpers"

export default function TranslateProviderField() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)

  const providers = useMemo(() => {
    return filterEnabledProvidersConfig(providersConfig)
      .filter(p => isTranslateProvider(p.provider))
  }, [providersConfig])
  const currentProvider = providers.find(provider => provider.id === translateConfig.providerId)
  const fallbackProvider = providers.find(isNonAPIProviderConfig) ?? providers[0]
  const shouldShowFallback = currentProvider
    && "apiKey" in currentProvider
    && !currentProvider.apiKey?.trim()
    && !["deeplx", "ollama"].includes(currentProvider.provider)

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium flex items-center gap-1.5">
          {i18n.t("translateService.title")}
          <HelpTooltip>
            {i18n.t("translateService.description")}
          </HelpTooltip>
        </span>
        <ProviderSelector
          providers={providers}
          value={translateConfig.providerId}
          onChange={id => void setTranslateConfig({ providerId: id })}
          className="h-7! w-31 cursor-pointer pr-1.5 pl-2.5"
        />
      </div>
      {shouldShowFallback && fallbackProvider && fallbackProvider.id !== translateConfig.providerId && (
        <button
          type="button"
          className="ml-auto text-[11px] font-medium text-[#8c3328] hover:underline"
          onClick={() => void setTranslateConfig({ providerId: fallbackProvider.id })}
        >
          当前服务缺少 API Key，切到
          {" "}
          {fallbackProvider.name}
        </button>
      )}
    </div>
  )
}
