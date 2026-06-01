# Read Frog Learning Daemon

This is the first container-ready daemon for the split learning workspace. It gives the extension bridge a real local API target while the full web workspace and SQLite store are still being built.

## Run Locally

```powershell
pnpm learning:daemon
```

Default endpoint:

```text
http://127.0.0.1:7457
```

Open the first daemon-hosted workspace at:

```text
http://127.0.0.1:7457/
```

The workspace shell is served from `apps/learning-daemon/workspace/`:

- `index.html`
- `app.css`
- `app.js`

The daemon TypeScript layer should stay focused on HTTP APIs and static asset delivery so the workspace can later move into a standalone Vite app without changing extension bridge contracts.

Useful environment variables:

- `READFROG_LEARNING_HOST`: bind host, default `127.0.0.1`.
- `READFROG_LEARNING_PORT`: bind port, default `7457`.
- `READFROG_LEARNING_DATA_DIR`: data directory, default `.readfrog-learning`.
- `READFROG_LEARNING_ALLOWED_ORIGINS`: comma-separated CORS allow list. Prefixes such as `chrome-extension://` are accepted.

## API

- `GET /api/v1/health`
- `GET /api/v1/events`
- `GET /api/v1/workspace/state`
- `GET /api/v1/projection`
- `GET /api/v1/projection/terms?terms=workflow,ability`
- `GET /api/v1/qwerty/dictionaries`
- `GET /api/v1/qwerty/dictionaries/:id/chapter/:chapterIndex`
- `POST /api/v1/capture/selection`
- `POST /api/v1/qwerty/records/word`
- `POST /api/v1/qwerty/records/chapter`

The daemon currently persists JSON state to `learning-daemon-state.json`. This is intentionally small; the next milestone can replace the store with SQLite without changing the extension bridge contract.

`POST /api/v1/qwerty/records/word` records qwerty-style typing practice and updates the mastery projection used by selective translation. Correct high-accuracy records move words into `review`; missed or low-accuracy records stay in `learning`.
After three consecutive high-accuracy correct records for the same word, the projection moves that word into `mature`, allowing the extension's selective translation mode to stop translating it.

`POST /api/v1/qwerty/records/chapter` records chapter-level practice results: dictionary, chapter index, duration, word count, correct/wrong counts, accuracy, and correct word indexes. This mirrors qwerty-learner's chapter analytics without requiring the extension to own those records.

`GET /api/v1/workspace/state` returns daemon-owned workspace summaries: recent extension captures, recent qwerty word records, and mastery distribution stats. The workspace UI uses this endpoint instead of reconstructing state from the projection table.

`GET /api/v1/events` is an SSE stream. The daemon emits `projection.updated` after selection captures and qwerty word records, and `qwerty.session.finished` after chapter records. The workspace subscribes to these events and refreshes itself after container-side or extension-side learning data changes.

Qwerty dictionary assets are now daemon/container assets under `apps/learning-daemon/dicts/qwerty`. The extension uses the daemon API instead of packaging these large JSON dictionaries into `public/`.

## Container

```powershell
docker compose -f apps/learning-daemon/compose.yaml up --build
```

The compose file exposes `127.0.0.1:7457` and stores daemon state in a named Docker volume.
The image and compose service include a health check against `GET /api/v1/health`, so the service should report `healthy` after the API is ready:

```powershell
docker compose -f apps/learning-daemon/compose.yaml ps
```

The extension should keep using `http://127.0.0.1:7457` as the bridge base URL. The daemon owns qwerty dictionaries, practice records, captures, and the mastery projection; the extension should only capture, request projection terms, and refresh its local bridge cache.
