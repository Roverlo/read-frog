import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const rootDir = new URL("..", import.meta.url).pathname
const normalizedRootDir = process.platform === "win32" && rootDir.startsWith("/")
  ? rootDir.slice(1)
  : rootDir

interface CheckResult {
  name: string
  failures: string[]
}

function repoPath(path: string) {
  return join(normalizedRootDir, path)
}

function readRepoFile(path: string) {
  return readFileSync(repoPath(path), "utf8")
}

function listFiles(dir: string): string[] {
  const absoluteDir = repoPath(dir)
  if (!existsSync(absoluteDir)) {
    return []
  }

  const entries = readdirSync(absoluteDir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const child = join(absoluteDir, entry.name)
    if (entry.isDirectory()) {
      return listFiles(relative(normalizedRootDir, child).replace(/\\/g, "/"))
    }
    return [relative(normalizedRootDir, child).replace(/\\/g, "/")]
  })
}

function git(args: string[]) {
  return execFileSync("git", args, {
    cwd: normalizedRootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function includesAny(source: string, patterns: string[]) {
  return patterns.some(pattern => source.includes(pattern))
}

function check(name: string, run: () => string[]): CheckResult {
  try {
    return { name, failures: run() }
  }
  catch (error) {
    return {
      name,
      failures: [error instanceof Error ? error.message : String(error)],
    }
  }
}

const qwertyDictionaryPattern = /(?:CET4_T|CET6_T|TOEFL_3_T|GRE_1500|Oxford3000|top2000words)\.json$/
const localLearningWritePatterns = [
  "@/utils/db/dexie/db",
  "@/utils/learning/items",
  "from \"./items\"",
  "from './items'",
  "upsertLearningItem",
  "markLearningItemReviewRating",
  "db.learningItems",
  "db.qwertyTypingRecords",
]
const contractForbiddenPatterns = [
  "#imports",
  "@/utils/db/dexie/db",
  "@/utils/message",
  "@webext-core/messaging",
  "react",
  "dexie",
  "browser.",
  "chrome.",
]

const checks = [
  check("git remotes keep upstream and fork separate", () => {
    const remotes = git(["remote", "-v"])
    const failures: string[] = []
    if (!remotes.includes("upstream") || !remotes.includes("https://github.com/mengxi-ream/read-frog.git")) {
      failures.push("Missing upstream remote for https://github.com/mengxi-ream/read-frog.git")
    }
    if (!remotes.includes("origin") || !remotes.includes("https://github.com/Roverlo/read-frog.git")) {
      failures.push("Missing origin remote for https://github.com/Roverlo/read-frog.git")
    }
    return failures
  }),

  check("fork patch inventory documents the upstream sync workflow", () => {
    const source = readRepoFile("FORK_PATCHES.md")
    const required = [
      "Recurring Sync Workflow",
      "git fetch upstream main",
      "git merge upstream/main",
      "Confirm daemon assets remain under `apps/learning-daemon`",
      "Confirm `.output/chrome-mv3/dicts/qwerty` is absent after build",
    ]
    return required.filter(text => !source.includes(text)).map(text => `FORK_PATCHES.md is missing: ${text}`)
  }),

  check("qwerty dictionaries stay owned by the learning daemon", () => {
    const daemonDicts = listFiles("apps/learning-daemon/dicts/qwerty")
      .filter(path => qwertyDictionaryPattern.test(path))
      .sort()
    const publicDicts = listFiles("public/dicts")
      .filter(path => qwertyDictionaryPattern.test(path))
      .sort()
    const failures: string[] = []
    if (daemonDicts.length < 6) {
      failures.push(`Expected daemon qwerty dictionaries under apps/learning-daemon/dicts/qwerty, found ${daemonDicts.length}`)
    }
    if (publicDicts.length > 0) {
      failures.push(`Qwerty dictionaries must not return to public/dicts: ${publicDicts.join(", ")}`)
    }
    return failures
  }),

  check("extension build output does not contain qwerty dictionary assets", () => {
    const outputDictDir = repoPath(".output/chrome-mv3/dicts")
    if (!existsSync(outputDictDir)) {
      return []
    }
    const hasFiles = statSync(outputDictDir).isDirectory() && listFiles(".output/chrome-mv3/dicts").length > 0
    return hasFiles ? [".output/chrome-mv3/dicts exists after build; qwerty assets are being bundled into the extension"] : []
  }),

  check("selective translation reads daemon projection instead of local learning tables", () => {
    const source = readRepoFile("src/utils/learning/selective-translation.ts")
    const failures: string[] = []
    if (!source.includes("getLearningProjectionTerms")) {
      failures.push("selective-translation.ts must query getLearningProjectionTerms")
    }
    if (!source.includes("shouldTranslateProjectionEntry")) {
      failures.push("selective-translation.ts must keep mastery decisions behind shouldTranslateProjectionEntry")
    }
    if (!source.includes("confidence") || !source.includes("dueAt")) {
      failures.push("selective-translation.ts must consider daemon confidence and dueAt when deciding whether to translate")
    }
    if (!source.includes("getCandidatePhrases") || !source.includes("coveredTokenIndexes")) {
      failures.push("selective-translation.ts must prefer daemon phrase projection before word fallbacks")
    }
    if (includesAny(source, localLearningWritePatterns)) {
      failures.push("selective-translation.ts imports or reads local learning persistence")
    }
    return failures
  }),

  check("qwerty practice writes stay behind the extension-to-daemon bridge", () => {
    const source = readRepoFile("src/utils/learning/qwerty-typing.ts")
    const bridgeService = readRepoFile("src/utils/learning-bridge/background-service.ts")
    const bridgeStorage = readRepoFile("src/utils/learning-bridge/storage.ts")
    const failures: string[] = []
    if (!source.includes("syncLearningQwertyWordRecord")) {
      failures.push("qwerty-typing.ts must write through syncLearningQwertyWordRecord")
    }
    if (!source.includes("syncLearningQwertyChapterRecord")) {
      failures.push("qwerty-typing.ts must write chapter records through syncLearningQwertyChapterRecord")
    }
    if (includesAny(source, localLearningWritePatterns)) {
      failures.push("qwerty-typing.ts imports or writes local learning persistence")
    }
    const requiredBridgeTokens = [
      "enqueueQwertyWordRecord",
      "enqueueQwertyChapterRecord",
      "replacePendingQwertyWordRecords",
      "replacePendingQwertyChapterRecords",
    ]
    failures.push(...requiredBridgeTokens
      .filter(text => !bridgeService.includes(text))
      .map(text => `background-service.ts is missing qwerty queue bridge token: ${text}`))

    const requiredStorageTokens = [
      "LEARNING_BRIDGE_PENDING_QWERTY_WORD_RECORDS_KEY",
      "LEARNING_BRIDGE_PENDING_QWERTY_CHAPTER_RECORDS_KEY",
      "MAX_PENDING_LEARNING_QWERTY_RECORDS",
    ]
    failures.push(...requiredStorageTokens
      .filter(text => !bridgeStorage.includes(text))
      .map(text => `storage.ts is missing qwerty queue storage token: ${text}`))
    return failures
  }),

  check("learning daemon keeps a portable import export migration boundary", () => {
    const contracts = readRepoFile("src/utils/learning-contracts/schemas.ts")
    const server = readRepoFile("apps/learning-daemon/src/server.ts")
    const store = readRepoFile("apps/learning-daemon/src/store.ts")
    const readme = readRepoFile("apps/learning-daemon/README.md")
    const failures: string[] = []

    const requiredContractTokens = [
      "learningDaemonExportResponseSchema",
      "learningDaemonImportRequestSchema",
      "read-frog-learning-daemon-v1",
    ]
    failures.push(...requiredContractTokens
      .filter(text => !contracts.includes(text))
      .map(text => `learning contracts are missing portable migration token: ${text}`))

    const requiredServerTokens = [
      'path === "/api/v1/export"',
      'path === "/api/v1/import"',
      "handleExport",
      "handleImport",
    ]
    failures.push(...requiredServerTokens
      .filter(text => !server.includes(text))
      .map(text => `learning daemon server is missing import/export token: ${text}`))

    const requiredStoreTokens = [
      "importLearningData",
      "getQwertyWordRecordKey",
      "getQwertyChapterRecordKey",
      "createDerivedProjectionEntries",
    ]
    failures.push(...requiredStoreTokens
      .filter(text => !store.includes(text))
      .map(text => `learning daemon store is missing idempotent import token: ${text}`))

    const requiredReadmeTokens = [
      "GET /api/v1/export",
      "POST /api/v1/import",
      "Imports are idempotent",
    ]
    failures.push(...requiredReadmeTokens
      .filter(text => !readme.includes(text))
      .map(text => `learning daemon README is missing import/export docs: ${text}`))

    return failures
  }),

  check("selection captures stay behind the extension-to-daemon bridge", () => {
    const source = readRepoFile("src/entrypoints/selection.content/selection-toolbar/save-learning-button/index.tsx")
    const failures: string[] = []
    if (!source.includes("syncLearningCaptureSelection")) {
      failures.push("selection save button must write through syncLearningCaptureSelection")
    }
    if (includesAny(source, localLearningWritePatterns)) {
      failures.push("selection save button imports or writes local learning persistence")
    }
    return failures
  }),

  check("options learning page remains a bridge, not the full workspace", () => {
    const source = readRepoFile("src/entrypoints/options/pages/learning/index.tsx")
    const failures: string[] = []
    if (!source.includes("Open") || !source.includes("Learning Workspace") || !source.includes("getLearningBridgeStatus")) {
      failures.push("learning options page should expose bridge status and open the daemon workspace")
    }
    if (source.includes("saveQwertyTypingResult") || source.includes("upsertLearningItem") || source.includes("markLearningItemReviewRating")) {
      failures.push("learning options page appears to contain rich learning workspace logic")
    }
    return failures
  }),

  check("learning contracts remain pure shared DTOs", () => {
    return listFiles("src/utils/learning-contracts")
      .filter(path => /\.(ts|tsx)$/.test(path))
      .filter(path => !path.includes("/__tests__/"))
      .flatMap((path) => {
        const source = readRepoFile(path)
        return contractForbiddenPatterns
          .filter(pattern => source.includes(pattern))
          .map(pattern => `${path} contains forbidden contract dependency: ${pattern}`)
      })
  }),

  check("background bridge messages stay registered", () => {
    const backgroundIndex = readRepoFile("src/entrypoints/background/index.ts")
    const bridge = readRepoFile("src/entrypoints/background/learning-bridge.ts")
    const required = [
      "setupLearningBridgeMessageHandlers",
      "setupLearningProjectionSyncAlarm",
      "syncLearningCaptureSelection",
      "syncLearningQwertyWordRecord",
      "syncLearningQwertyChapterRecord",
      "getLearningProjectionTerms",
      "syncLearningProjectionCache",
    ]
    const source = `${backgroundIndex}\n${bridge}`
    return required.filter(text => !source.includes(text)).map(text => `Background bridge registration is missing: ${text}`)
  }),
]

const failures = checks.flatMap(result => result.failures.map(failure => ({ check: result.name, failure })))

for (const result of checks) {
  if (result.failures.length === 0) {
    console.log(`ok - ${result.name}`)
  }
  else {
    console.error(`not ok - ${result.name}`)
    for (const failure of result.failures) {
      console.error(`  - ${failure}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} upstream sync guard failure(s).`)
  process.exit(1)
}

console.log("\nUpstream sync guard passed.")
