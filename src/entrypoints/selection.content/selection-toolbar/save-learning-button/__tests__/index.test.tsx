// @vitest-environment jsdom

import type { ReactElement } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SaveLearningButton } from ".."

const {
  extractLearningChildrenMock,
  generateLearningExplanationMock,
  handlePressMock,
  providersAtomMock,
  selectionSessionAtomMock,
  sendMessageMock,
  toastErrorMock,
  toastSuccessMock,
  upsertLearningItemMock,
  useAtomValueMock,
} = vi.hoisted(() => ({
  extractLearningChildrenMock: vi.fn(),
  generateLearningExplanationMock: vi.fn(),
  handlePressMock: vi.fn(),
  providersAtomMock: { key: "providers" },
  selectionSessionAtomMock: { key: "selection-session" },
  sendMessageMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  upsertLearningItemMock: vi.fn(),
  useAtomValueMock: vi.fn(),
}))

vi.mock("jotai", async importOriginal => ({
  ...await importOriginal<typeof import("jotai")>(),
  useAtomValue: useAtomValueMock,
}))

vi.mock("@/types/config/provider", async importOriginal => ({
  ...await importOriginal<typeof import("@/types/config/provider")>(),
  isLLMProviderConfig: () => true,
}))

vi.mock("../../atoms", () => ({
  selectionSessionAtom: selectionSessionAtomMock,
}))

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: {
    providersConfig: providersAtomMock,
  },
}))

vi.mock("@/utils/learning/ai", () => ({
  extractLearningChildren: extractLearningChildrenMock,
  generateLearningExplanation: generateLearningExplanationMock,
}))

vi.mock("@/utils/learning/items", () => ({
  upsertLearningItem: upsertLearningItemMock,
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("../../../components/selection-tooltip", () => ({
  SelectionToolbarTooltip: ({ render }: { render: ReactElement }) => render,
  useSelectionTooltipState: () => ({
    handlePress: handlePressMock,
    onOpenChange: vi.fn(),
    open: false,
  }),
}))

function createSelectionSession() {
  const textNode = document.createTextNode("workflow")
  return {
    id: 1,
    createdAt: Date.now(),
    selectionSnapshot: {
      text: "workflow",
      ranges: [{
        startContainer: textNode,
        startOffset: 0,
        endContainer: textNode,
        endOffset: 8,
      }],
    },
    contextSnapshot: {
      text: "A workflow is a repeatable process.",
      paragraphs: ["A workflow is a repeatable process."],
    },
  }
}

const providerConfig = {
  id: "openai-default",
  name: "OpenAI",
  enabled: true,
  provider: "openai",
}

describe("saveLearningButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    document.title = "Learning source"
    useAtomValueMock.mockImplementation((atom) => {
      if (atom === selectionSessionAtomMock)
        return createSelectionSession()
      if (atom === providersAtomMock)
        return [providerConfig]
      return undefined
    })
    generateLearningExplanationMock.mockResolvedValue({
      meaningZh: "工作流",
      examples: [],
    })
    extractLearningChildrenMock.mockResolvedValue([
      {
        text: "repeatable process",
        kind: "phrase",
        explanation: {
          meaningZh: "可重复流程",
          examples: [],
        },
        tags: ["process"],
      },
    ])
    sendMessageMock.mockResolvedValue({
      status: "synced",
      pendingCaptureCount: 0,
      flushedCaptureCount: 0,
    })
  })

  it("saves selection captures through the learning daemon bridge", async () => {
    render(<SaveLearningButton />)

    fireEvent.click(screen.getByRole("button", { name: "加入学习容器" }))

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith("syncLearningCaptureSelection", {
        text: "workflow",
        context: "A workflow is a repeatable process.",
        sourceTitle: "Learning source",
        sourceUrl: "http://localhost:3000/",
        explanation: {
          meaningZh: "工作流",
          examples: [],
        },
        extractedItems: [{
          text: "repeatable process",
          kind: "phrase",
          explanation: {
            meaningZh: "可重复流程",
            examples: [],
          },
          tags: ["process"],
        }],
      })
    })
    expect(upsertLearningItemMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalledWith("已同步到学习容器，并抽取 1 个重点")
  })

  it("reports queued captures when the daemon is offline", async () => {
    sendMessageMock.mockResolvedValue({
      status: "queued",
      pendingCaptureCount: 1,
      flushedCaptureCount: 0,
    })

    render(<SaveLearningButton />)

    fireEvent.click(screen.getByRole("button", { name: "加入学习容器" }))

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("学习容器离线，已加入待同步队列，并抽取 1 个重点")
    })
    expect(upsertLearningItemMock).not.toHaveBeenCalled()
  })

  it("reports disabled bridge state instead of writing local learning data", async () => {
    sendMessageMock.mockResolvedValue({
      status: "disabled",
      pendingCaptureCount: 0,
      flushedCaptureCount: 0,
    })

    render(<SaveLearningButton />)

    fireEvent.click(screen.getByRole("button", { name: "加入学习容器" }))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("学习容器桥接已关闭")
    })
    expect(upsertLearningItemMock).not.toHaveBeenCalled()
  })
})
