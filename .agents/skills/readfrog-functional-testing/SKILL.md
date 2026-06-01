---
name: readfrog-functional-testing
description: Strict functional verification workflow for read-frog changes. Use when Codex must choose or run validation for this WXT browser extension, especially after feature work, UI changes, extension behavior changes, membership/beta-gate removals, Qwerty learning changes, Notebase flows, translation flows, or before claiming a feature is complete.
---

# Read Frog Functional Testing

Use this skill to turn "it should work" into evidence. The default standard for read-frog is layered validation: static checks, targeted unit/component tests, production build, artifact inspection, and real-browser evidence when behavior depends on extension runtime or visible UI.

## Decision Tree

1. For pure utilities or data normalization, run targeted tests plus `pnpm exec tsc --noEmit`.
2. For React options pages, popup, side panel, selection toolbar, or content UI, add component tests when practical, run the global test suite when risk is not tiny, build, and inspect visible text in source/build artifacts.
3. For extension runtime behavior, content scripts, popup-to-tab messaging, storage, permissions, or page translation, use `$extension-real-browser-testing` against the built unpacked artifact.
4. For WXT manifest, entrypoints, storage, or fake browser tests, also use `$wxt` and its testing reference.
5. If a feature touches external services, verify local behavior and error handling separately from live service availability. Do not call a missing account or remote 403 a local feature failure unless the product requirement says so.

## Required Gates

Run the narrowest set that proves the change, but do not skip a broader gate when the change touches shared behavior or user-visible UI.

PowerShell commands:

```powershell
pnpm exec tsc --noEmit
$env:SKIP_FREE_API='true'; pnpm test
$env:WXT_SKIP_ENV_VALIDATION='true'; pnpm build
git diff --check
```

For local test runs, always set `SKIP_FREE_API=true` because `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.

## Feature Matrix

Use [references/feature-matrix.md](references/feature-matrix.md) to choose concrete evidence by surface. Load it when the task is more than a trivial utility edit.

## Artifact Inspection

After build, inspect `.output/chrome-mv3` for the exact user-facing claims being changed. Examples:

```powershell
rg -n "Public Beta|Notebase Beta|premium|subscription|locked|not enrolled" .output\chrome-mv3 src\entrypoints src\locales src\utils -g "*.js" -g "*.json" -g "*.ts" -g "*.tsx" -g "*.yml"
```

Add task-specific localized terms to the search when the change touches localized UI. Treat expected dictionary content separately from UI content; a word-list definition for "membership" is not a feature gate.

Also scan built JavaScript for Unicode noncharacters after dependency or build changes. Chromium may reject an unpacked extension content script with a misleading "not UTF-8" error even when Node can decode the file as UTF-8.

## Real Browser Rule

Use real browser validation when the feature depends on:

- unpacked extension loading
- content scripts or shadow DOM
- popup/options pages calling extension APIs
- runtime messages
- storage state
- visible layout or interaction

Use the existing `$extension-real-browser-testing` skill for this path. Build first, load `.output/chrome-mv3`, use a fresh profile, record DOM/runtime evidence, and keep raw screenshots when visual state matters.

If local in-app browser verification fails because an extension URL or localhost page is blocked, do not silently substitute weak evidence. Fall back to Playwright/Edge unpacked-extension testing or clearly report the browser blocker and use build artifact inspection only for text-level claims.

## Completion Standard

A final verification report must include:

- what changed or what is being verified
- which gates ran and their result
- what real-browser or artifact evidence proves visible behavior
- what was not verified and why
- whether any remaining failures are product issues, environment blockers, or external-service requirements

Do not claim "fully verified" from type-checks alone for a browser extension UI change.
