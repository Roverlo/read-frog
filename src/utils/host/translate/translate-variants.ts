import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { Config, InputTranslationLang } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { isAPIProviderConfig, isLLMProviderConfig } from "@/types/config/provider"
import { getProviderConfigById } from "@/utils/config/helpers"
import { getDetectedCodeFromStorage, getFinalSourceCode } from "@/utils/config/languages"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { detectLanguage } from "@/utils/content/language"
import { buildLearningTranslationSummary } from "@/utils/learning/selective-translation"
import { logger } from "@/utils/logger"
import { getLocalConfig } from "../../config/storage"
import { prepareTranslationText } from "./text-preparation"
import { MIN_LENGTH_FOR_SKIP_LLM_DETECTION, shouldSkipByLanguage, translateTextCore } from "./translate-text"
import { getOrCreateWebPageContext } from "./webpage-context"
import { getOrGenerateWebPageSummary } from "./webpage-summary"

const MIN_LENGTH_FOR_TARGET_LANG_DETECTION = 50

async function getConfigOrThrow(): Promise<Config> {
  const config = await getLocalConfig()
  if (!config) {
    throw new Error("No global config when translate text")
  }
  return config
}

async function isTextAlreadyInTargetLanguage(text: string, targetCode: LangCodeISO6393) {
  if (text.length < MIN_LENGTH_FOR_TARGET_LANG_DETECTION)
    return false
  const detected = await detectLanguage(text, { enableLLM: false })
  return detected === targetCode
}

function shouldFallbackFromProvider(providerConfig: ProviderConfig) {
  return isAPIProviderConfig(providerConfig)
    && !providerConfig.apiKey?.trim()
    && !["deeplx", "ollama"].includes(providerConfig.provider)
}

function resolvePageTranslateProviderConfig(config: Config) {
  const providerConfig = resolveProviderConfig(config, "translate")
  if (!shouldFallbackFromProvider(providerConfig)) {
    return providerConfig
  }

  return getProviderConfigById(config.providersConfig, "microsoft-translate-default")
    ?? getProviderConfigById(config.providersConfig, "google-translate-default")
    ?? providerConfig
}

async function getWebPagePromptContext(
  providerConfig: ReturnType<typeof resolveProviderConfig>,
  enableAIContentAware: boolean,
  includeSummary: boolean,
): Promise<{ webTitle: string, webContent: string, webSummary?: string } | undefined> {
  if (!isLLMProviderConfig(providerConfig)) {
    return undefined
  }

  const webPageContext = await getOrCreateWebPageContext()
  if (!webPageContext) {
    return undefined
  }

  const webSummary = includeSummary
    ? await getOrGenerateWebPageSummary(webPageContext, providerConfig, enableAIContentAware)
    : undefined

  return {
    webTitle: webPageContext.webTitle,
    webContent: webPageContext.webContent,
    webSummary: webSummary ?? undefined,
  }
}

async function translateTextUsingPageConfig(
  config: Config,
  text: string,
  options: {
    extraHashTags?: string[]
    applyLearningMode?: boolean
    webPageContext?: { webTitle?: string | null, webContent?: string | null, webSummary?: string | null }
  } = {},
): Promise<string> {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const providerConfig = resolvePageTranslateProviderConfig(config)

  if (
    config.translate.page.enableTargetLanguageSkip
    && await isTextAlreadyInTargetLanguage(preparedText, config.language.targetCode)
  ) {
    logger.info(`translateTextForPage: skipping translation because text is already in target language. text: ${preparedText}`)
    return ""
  }

  // Skip translation if text is in skipLanguages list (page translation only)
  const { skipLanguages } = config.translate.page
  if (skipLanguages.length > 0 && preparedText.length >= MIN_LENGTH_FOR_SKIP_LLM_DETECTION) {
    const shouldSkip = await shouldSkipByLanguage(
      preparedText,
      skipLanguages,
      config.languageDetection.mode === "llm",
    )
    if (shouldSkip) {
      logger.info(`translateTextForPage: skipping translation because text is in skip language list. text: ${preparedText}`)
      return ""
    }
  }

  if (options.applyLearningMode !== false && config.translate.page.learningMode.enabled) {
    return buildLearningTranslationSummary(
      preparedText,
      config.translate.page.learningMode.maxTermsPerParagraph,
    )
  }

  return translateTextCore({
    text: preparedText,
    langConfig: config.language,
    providerConfig,
    enableAIContentAware: config.translate.enableAIContentAware,
    extraHashTags: options.extraHashTags,
    webPageContext: options.webPageContext,
  })
}

/**
 * Page translation — uses FEATURE_PROVIDER_DEFS['translate'].
 * Includes skip-language logic (page translation only).
 */
export async function translateTextForPage(text: string): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolvePageTranslateProviderConfig(config)
  const webPageContext = await getWebPagePromptContext(providerConfig, config.translate.enableAIContentAware, true)

  return translateTextUsingPageConfig(config, text, {
    webPageContext,
  })
}

/**
 * Page title translation — uses page translation settings, but always treats the
 * current source title as the webpage title context.
 */
export async function translateTextForPageTitle(text: string): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolvePageTranslateProviderConfig(config)
  const webPageContext = config.translate.enableAIContentAware
    ? await getWebPagePromptContext(providerConfig, true, false)
    : undefined

  return translateTextUsingPageConfig(config, text, {
    applyLearningMode: false,
    extraHashTags: ["pageTitleTranslation"],
    webPageContext: {
      webTitle: text,
      webContent: webPageContext?.webContent,
      webSummary: webPageContext?.webSummary,
    },
  })
}

async function resolveInputLang(
  lang: InputTranslationLang,
  globalLangConfig: Config["language"],
): Promise<LangCodeISO6393> {
  if (lang === "sourceCode") {
    const detectedCode = await getDetectedCodeFromStorage()
    return getFinalSourceCode(globalLangConfig.sourceCode, detectedCode)
  }
  if (lang === "targetCode") {
    return globalLangConfig.targetCode
  }
  return lang
}

/**
 * Input translation — uses FEATURE_PROVIDER_DEFS['inputTranslation'].
 */
export async function translateTextForInput(
  text: string,
  fromLang: InputTranslationLang,
  toLang: InputTranslationLang,
): Promise<string> {
  const config = await getConfigOrThrow()
  const providerConfig = resolveProviderConfig(config, "inputTranslation")

  const resolvedFromLang = await resolveInputLang(fromLang, config.language)
  const resolvedToLang = await resolveInputLang(toLang, config.language)

  if (resolvedFromLang === resolvedToLang) {
    return ""
  }

  const webPageContext = await getWebPagePromptContext(
    providerConfig,
    config.translate.enableAIContentAware,
    true,
  )

  return translateTextCore({
    text,
    langConfig: {
      sourceCode: resolvedFromLang,
      targetCode: resolvedToLang,
      level: config.language.level,
    },
    extraHashTags: [`inputTranslation:${fromLang}->${toLang}`],
    providerConfig,
    enableAIContentAware: config.translate.enableAIContentAware,
    webPageContext,
  })
}
