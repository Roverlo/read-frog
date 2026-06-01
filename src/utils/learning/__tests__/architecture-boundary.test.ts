import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const rootDir = process.cwd()

async function readRepoFile(path: string) {
  return await readFile(join(rootDir, path), "utf8")
}

async function listFiles(dir: string): Promise<string[]> {
  let entries: Dirent<string>[]
  try {
    entries = await readdir(join(rootDir, dir), { withFileTypes: true })
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }

  const files = await Promise.all(entries.map(async (entry) => {
    const childPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      return await listFiles(childPath)
    }
    return [childPath]
  }))

  return files.flat().map(path => relative(rootDir, join(rootDir, path)).replace(/\\/g, "/"))
}

function expectNoLocalLearningWrites(source: string) {
  expect(source).not.toMatch(/@\/utils\/db\/dexie\/db/)
  expect(source).not.toMatch(/@\/utils\/learning\/items/)
  expect(source).not.toMatch(/from "\.\/items"/)
  expect(source).not.toMatch(/\bupsertLearningItem\b/)
  expect(source).not.toMatch(/\bmarkLearningItemReviewRating\b/)
  expect(source).not.toMatch(/\bdb\.learningItems\b/)
  expect(source).not.toMatch(/\bdb\.qwertyTypingRecords\b/)
}

describe("learning workspace architecture boundary", () => {
  it("keeps qwerty practice writes behind the extension-to-daemon bridge", async () => {
    const source = await readRepoFile("src/utils/learning/qwerty-typing.ts")

    expectNoLocalLearningWrites(source)
    expect(source).toContain("syncLearningQwertyWordRecord")
    expect(source).toContain("getLearningWorkspaceState")
    expect(source).not.toMatch(/postLearningQwertyWordRecord/)
  })

  it("keeps selection learning captures behind the extension-to-daemon bridge", async () => {
    const source = await readRepoFile("src/entrypoints/selection.content/selection-toolbar/save-learning-button/index.tsx")

    expectNoLocalLearningWrites(source)
    expect(source).toContain("syncLearningCaptureSelection")
  })

  it("keeps production extension entrypoints from importing local learning item writes", async () => {
    const files = (await listFiles("src/entrypoints"))
      .filter(path => /\.(ts|tsx)$/.test(path))
      .filter(path => !path.includes("/__tests__/"))

    const offenders: string[] = []
    await Promise.all(files.map(async (file) => {
      const source = await readRepoFile(file)
      if (
        source.includes("@/utils/learning/items")
        || source.includes("upsertLearningItem")
        || source.includes("markLearningItemReviewRating")
        || source.includes("db.learningItems")
        || source.includes("db.qwertyTypingRecords")
      ) {
        offenders.push(file)
      }
    }))

    expect(offenders.sort()).toEqual([])
  })

  it("keeps qwerty dictionary JSON assets in the learning daemon instead of the extension public bundle", async () => {
    const daemonDicts = await listFiles("apps/learning-daemon/dicts/qwerty")
    const publicDicts = await listFiles("public/dicts")
    const qwertyDictionaryPattern = /(?:CET4_T|CET6_T|TOEFL_3_T|GRE_1500|Oxford3000|top2000words)\.json$/

    expect(daemonDicts.filter(path => qwertyDictionaryPattern.test(path)).sort()).toEqual([
      "apps/learning-daemon/dicts/qwerty/CET4_T.json",
      "apps/learning-daemon/dicts/qwerty/CET6_T.json",
      "apps/learning-daemon/dicts/qwerty/GRE_1500.json",
      "apps/learning-daemon/dicts/qwerty/Oxford3000.json",
      "apps/learning-daemon/dicts/qwerty/TOEFL_3_T.json",
      "apps/learning-daemon/dicts/qwerty/top2000words.json",
    ])
    expect(publicDicts.filter(path => qwertyDictionaryPattern.test(path))).toEqual([])
  })
})
