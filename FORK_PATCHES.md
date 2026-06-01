# Read Frog Fork Patch Inventory

This branch keeps Read Frog close to `mengxi-ream/read-frog` by moving the learning workspace into a daemon/container and keeping extension changes narrow.

Last updated: 2026-06-01.

## Upstream Remotes

- Upstream: `https://github.com/mengxi-ream/read-frog`
- Fork: `https://github.com/Roverlo/read-frog`
- Working branch: `feature/learning-loop`

## Patch Boundaries

### Containerized Learning Workspace

Owned fork surface:

- `apps/learning-daemon/**`
- `LEARNING_CONTAINER_REDESIGN.md`

Purpose:

- Host the learning workspace outside the extension.
- Persist learning projection and qwerty records in daemon-owned local data.
- Serve qwerty dictionary assets from the container instead of extension `public/`.

Upstream sync rule:

- Prefer resolving conflicts by keeping daemon work isolated in `apps/learning-daemon`.
- Do not move large learning UI or dictionary assets back into extension entrypoints.

### Extension-Daemon Bridge

Owned fork surface:

- `src/utils/learning-contracts/**`
- `src/utils/learning-bridge/**`
- `src/entrypoints/background/learning-bridge.ts`
- background registration in `src/entrypoints/background/index.ts`
- protocol additions in `src/utils/message.ts`

Purpose:

- Give content scripts, popup, options, and translation code a typed boundary to the daemon.
- Queue selection captures and qwerty practice records locally when the daemon is offline.
- Query mastery projection terms for selective translation.

Upstream sync rule:

- Keep contracts pure: no WXT, React, Dexie, or daemon internals.
- Keep background registration as a small append-only hook.

### Learning Extension Controls

Owned fork surface:

- `src/entrypoints/options/pages/learning/index.tsx`
- learning navigation entries in `src/entrypoints/options/app.tsx`, `src/entrypoints/options/app-sidebar/**`
- learning toggle in `src/entrypoints/popup/components/learning-translation-toggle.tsx`
- selection toolbar learning save button in `src/entrypoints/selection.content/selection-toolbar/save-learning-button/**`

Purpose:

- Keep the extension as a thin bridge: open daemon workspace, configure daemon URL, toggle selection capture, and toggle selective translation.
- Avoid maintaining the full learning dashboard, qwerty trainer, review sessions, import/export, and analytics inside extension options.

Upstream sync rule:

- If upstream changes options layout, preserve only the thin bridge entry.
- Rich learning UI belongs in daemon/web surfaces.

### Selective Translation

Owned fork surface:

- `src/utils/learning/selective-translation.ts`
- additions in `src/utils/host/translate/translate-variants.ts`
- config schema/defaults for `translate.page.learningMode`
- popup/options toggle code that enables the learning mode

Purpose:

- Use daemon mastery projection to skip mature/archived terms and translate learning/review terms.
- Fall back locally when the daemon is offline.

Upstream sync rule:

- Keep provider, prompt, language, and queue changes minimal.
- Translation cache changes must include projection-relevant inputs before selective translation is treated as complete.

### Legacy Local Learning Fallback

Owned fork surface:

- `src/types/learning.ts`
- `src/utils/db/dexie/tables/*learning*`
- `src/utils/db/dexie/tables/qwerty-typing-record.ts`
- `src/utils/learning/**`

Purpose:

- Preserve offline capture/review data while daemon migration matures.
- Mirror qwerty practice records to daemon when available.

Upstream sync rule:

- Keep local fallback code behind learning-specific modules.
- Do not spread learning persistence into unrelated provider, language, or translation modules.

## Recurring Sync Workflow

```powershell
git fetch upstream main
git checkout -b codex/upstream-sync-YYYYMMDD feature/learning-loop
git merge upstream/main
```

Then:

```powershell
pnpm exec tsc --noEmit
$env:SKIP_FREE_API='true'; pnpm test
$env:WXT_SKIP_ENV_VALIDATION='true'; pnpm build
pnpm check:upstream-sync
git diff --check
```

Before merging the sync branch back:

- Confirm daemon assets remain under `apps/learning-daemon`.
- Confirm `.output/chrome-mv3/dicts/qwerty` is absent after build.
- Confirm `src/entrypoints/options/pages/learning/index.tsx` remains a bridge page, not a rich workspace.
- Confirm selective translation tests still cover daemon projection/cache behavior and do not read local learning tables.

The `pnpm check:upstream-sync` guard turns the main fork-specific boundaries into a repeatable local check. It is intentionally conservative and should run after every upstream merge rehearsal, after build output exists.
