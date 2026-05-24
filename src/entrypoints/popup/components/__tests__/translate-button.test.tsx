// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { isPageTranslatedAtom } from "../../atoms/auto-translate"
import { isIgnoreTabAtom } from "../../atoms/ignore"
import { isCurrentSiteInBlacklistAtom, isCurrentSiteInWhitelistAtom } from "../../atoms/site-control"
import TranslateButton from "../translate-button"

const sendMessageMock = vi.fn()

vi.mock("@/utils/message", () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}))

function renderTranslateButton({
  ignored = false,
  blacklisted = false,
  whitelisted = true,
} = {}) {
  const store = createStore()
  store.set(configAtom, DEFAULT_CONFIG)
  store.set(isPageTranslatedAtom, false)
  store.set(isIgnoreTabAtom, ignored)
  store.set(isCurrentSiteInBlacklistAtom, blacklisted)
  store.set(isCurrentSiteInWhitelistAtom, whitelisted)

  return render(
    <Provider store={store}>
      <TranslateButton className="w-full" />
    </Provider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("popup TranslateButton", () => {
  beforeEach(() => {
    browser.tabs.query = vi.fn().mockResolvedValue([{ id: 42, url: "https://example.com/article" }])
  })

  it("shows why the current extension/internal page cannot be translated", () => {
    renderTranslateButton({ ignored: true })

    const button = screen.getByRole("button", { name: "当前页面不可翻译" })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", "当前页面不可翻译")
  })

  it("sends the page translation toggle message on normal pages", async () => {
    renderTranslateButton()

    fireEvent.click(screen.getByRole("button", { name: /popup\.translate|翻译/ }))

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "tryToSetEnablePageTranslationByTabId",
        expect.objectContaining({
          enabled: true,
          tabId: 42,
        }),
      )
    })
  })
})
