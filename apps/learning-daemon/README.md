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

Useful environment variables:

- `READFROG_LEARNING_HOST`: bind host, default `127.0.0.1`.
- `READFROG_LEARNING_PORT`: bind port, default `7457`.
- `READFROG_LEARNING_DATA_DIR`: data directory, default `.readfrog-learning`.
- `READFROG_LEARNING_ALLOWED_ORIGINS`: comma-separated CORS allow list. Prefixes such as `chrome-extension://` are accepted.

## API

- `GET /api/v1/health`
- `GET /api/v1/projection`
- `POST /api/v1/capture/selection`

The daemon currently persists JSON state to `learning-daemon-state.json`. This is intentionally small; the next milestone can replace the store with SQLite without changing the extension bridge contract.

## Container

```powershell
docker compose -f apps/learning-daemon/compose.yaml up --build
```

The compose file exposes `127.0.0.1:7457` and stores daemon state in a named Docker volume.
