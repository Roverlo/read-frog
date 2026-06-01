// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { i18n } from "#imports"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { SaveToNotebaseButton } from "../save-to-notebase-button"

vi.mock("@/utils/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: null,
      isPending: false,
    }),
  },
}))

function cloneConfig(config: Config): Config {
  return JSON.parse(JSON.stringify(config)) as Config
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

function createAction(): SelectionToolbarCustomAction {
  return {
    id: "action-1",
    name: "Summarize",
    icon: "tabler:sparkles",
    providerId: "provider-1",
    systemPrompt: "system",
    prompt: "prompt",
    outputSchema: [
      {
        id: "field-summary",
        name: "summary",
        type: "string",
        description: "",
        speaking: false,
      },
    ],
    notebaseConnection: {
      tableId: "table-1",
      tableNameSnapshot: "Articles",
      mappings: [],
    },
  }
}

describe("saveToNotebaseButton fork feature unlock", () => {
  it("renders even when beta experience is disabled", () => {
    const store = createStore()
    const queryClient = createTestQueryClient()
    const config = cloneConfig(DEFAULT_CONFIG)

    config.betaExperience.enabled = false
    store.set(configAtom, config)

    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <SaveToNotebaseButton
            action={createAction()}
            isRunning={false}
            result={{ summary: "A short summary" }}
          />
        </QueryClientProvider>
      </Provider>,
    )

    expect(screen.getByRole("button", { name: i18n.t("action.saveToNotebase") })).toBeInTheDocument()
  })
})
