# Read Frog Feature Verification Matrix

Use this matrix to select evidence. Combine rows when a change spans surfaces.

| Surface | Evidence to collect |
| --- | --- |
| Learning page / Qwerty typing | Unit tests for dictionary normalization, scoring, persistence, and UI component behavior; build; options page text/artifact scan; browser screenshot or DOM evidence for visible controls when UI changes. |
| Membership, beta, or feature gates | Source search for gate terms and conditional branches; build artifact search for user-visible residual text; tests proving disabled config still renders unlocked surfaces; browser evidence when the UI surface is reachable. |
| Notebase custom actions | Component tests for field rendering and save button state; source search for beta/403 gating; build artifact search for locked text; if authenticated remote state is required, separate local UI behavior from real readfrog.app account availability. |
| Text-to-speech settings | Component/static checks for labels and controls; build artifact search for "Public Beta" or disabled messaging; browser evidence if layout or interaction changed. |
| Selection toolbar/content script UI | Unit/component tests where possible; built extension loaded in a real browser; trigger the content script on a minimal page; inspect shadow DOM, computed visibility, and raw screenshots. |
| Page translation | Built extension in Edge/Chrome with a fresh profile; set config via extension page; trigger runtime message; capture spinner DOM evidence; wait for translated wrappers with target-language text. |
| Popup/options extension pages | Build; open the actual extension page if possible; inspect DOM text, console errors, and local storage/config effects. |
| WXT manifest or entrypoints | `pnpm exec tsc --noEmit`; `WXT_SKIP_ENV_VALIDATION=true pnpm build`; inspect `.output/chrome-mv3/manifest.json`; use `$wxt` references for entrypoint constraints. |
| External providers/APIs | Unit-test local request shaping and error mapping; do not require live paid accounts for local validation unless the task explicitly requires live integration. |

Minimum report language:

- "Verified by ..." for direct evidence.
- "Not verified because ..." for blocked browser or external-account checks.
- "Out of scope/external service" only when the product behavior is local and the missing part is account, token, remote API, or third-party access.
