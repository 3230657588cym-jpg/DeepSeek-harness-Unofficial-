# DeepSeek Harness — macOS Desktop App

> **⚠️ DISCLAIMER — Not an official DeepSeek product**
>
> This is an **unofficial, community-built desktop wrapper** for the DeepSeek Harness web interface.
> It is **not affiliated with, endorsed by, or produced by DeepSeek** (DeepSeek AI).
>
> The official DeepSeek Harness is available at: **https://www.deepseek.com/harness/**
>
> "DeepSeek" and related names/trademarks belong to their respective owners. This project only wraps
> the published `@deepseek-ai/dsh` npm package and adds no DeepSeek code or branding beyond the package name.

This project packages the existing **DeepSeek Harness web interface** (`dsh web`) into a standalone
macOS desktop app:

- Double-click to launch — no browser, no manual server startup
- No Node.js / Python / Bun / Electron runtime required on the target machine
- The full Harness Runtime and Web UI are preserved
- Closing the app shuts down the backend and all child processes — nothing left behind

## Architecture

An **Electron shell around the built-in dsh backend** — the existing Harness is reused, not rewritten.

```
DeepSeek Harness.app
├── Electron main process (main.js)
│     ├── Spawns the bundled Harness Runtime (Electron's own Node as a child process)
│     ├── Waits for the local server to be ready (parses the URL printed by `dsh web`)
│     ├── Opens a native window loading the existing Web UI
│     └── Terminates the whole backend process tree on quit
├── Harness Runtime (@deepseek-ai/dsh)
│     ├── Agent / LLM / Tools
│     ├── Shell / Terminal (node-pty)
│     ├── File System
│     ├── MCP
│     └── Local API server (node:http, 127.0.0.1)
└── Renderer (existing React Web UI)
```

Key points:

- **Backend runs as a child process**: `ELECTRON_RUN_AS_NODE=1` reuses Electron's bundled Node,
  so end users do **not** need Node.js installed.
- **`asar: false`**: the dsh backend runs as a plain Node child process and cannot read an asar
  archive; it also ships N-API native modules (node-pty / sharp / koffi), so keeping everything
  unpacked is the safest option.
- **Automatic port selection**: `--port 0` lets the OS pick a free port, avoiding conflicts.
- **Data persistence**: reuses the same `~/.dsh` directory as the web version (sessions, settings,
  credentials, history), shared with `dsh web` and never written to a temp directory. Override with
  the `DSH_HOME` environment variable.

## Development

```bash
npm install
npm run dev        # Launch Electron + the bundled dsh backend (with logs)
npm start          # Same as dev, without dev logs
npm run smoke      # Headless self-check: start backend → verify UI → load window → clean exit
```

Logs go to the terminal in dev mode; runtime logs are also written to
`~/Library/Logs/DeepSeek Harness/dsh-backend.log`.

## Building

```bash
npm run dist:dir   # Produce the .app only (no dmg, for quick verification)
npm run dist       # Produce .app + .dmg + .zip
npm run pack       # Same as dist (dmg + zip)
```

Artifacts are written to `release/`:

- `release/mac-arm64/DeepSeek Harness.app` — the double-clickable app
- `release/DeepSeek Harness-0.1.0-arm64.dmg` — installer image (drag into Applications)
- `release/DeepSeek Harness-0.1.0-arm64.zip` — portable zip

Only **Apple Silicon (arm64)** is built by default. For Intel Macs, change `arch` under
`mac.target` in `electron-builder.yml` to `[arm64, x64]` or `[universal]`.

## Smoke test

```bash
./release/mac-arm64/DeepSeek\ Harness.app/Contents/MacOS/DeepSeek\ Harness --smoke
```

`SMOKE_OK` with exit code 0 means it passed.

## Code signing & the "damaged app" issue

The build is **ad-hoc signed** (runs locally, but not notarized).

- **Why "damaged, cannot be opened" appears** — two causes combined:
  1. the app was not properly signed (broken signature chain);
  2. the files carry `com.apple.quarantine` / `FinderInfo` attributes (e.g. transferred via
     QQ/WeChat/cloud drives, or stored in the iCloud-synced `Documents` folder, which keeps
     re-attaching attributes).

  This project fixes both at the source: `electron-builder.yml` sets `identity: "-"` (ad-hoc
  signing), and the build output goes to `/tmp/dsh-release` (outside iCloud sync), then is copied
  back to `release/` automatically.

- **Recommended: install via the dmg**. Open the `.dmg` → drag the app into Applications → launch
  it from Applications (`/Applications` is not iCloud-synced, so the signature is left alone).

- **If double-clicking the `.app` still shows "damaged"**, clear the file attributes first:

  ```bash
  xattr -cr "/Users/steve/Documents/harness app/release/mac-arm64/DeepSeek Harness.app"
  ```

Distributing to **other Macs** requires Apple Developer ID signing + notarization; otherwise the
first launch is blocked by Gatekeeper (right-click → Open, or System Settings → Privacy & Security).

```bash
# Build and notarize with your Developer ID
CSC_LINK=/path/to/cert.p12 \
CSC_KEY_PASSWORD=xxx \
APPLE_ID=you@example.com \
APPLE_APP_SPECIFIC_PASSWORD=xxxx \
APPLE_TEAM_ID=XXXXXXXXXX \
npm run dist
```

## Data & configuration

- Harness data lives in `~/.dsh`, same as the web version (`DSH_HOME` can override).
- The DeepSeek API key is provided via `.env` (`~/.dsh/.env` or a project `.env`) or the
  `DEEPSEEK_API_KEY` environment variable — it is **never hardcoded** into the app.

## Known limitations

- Unsigned / not notarized: distributing to other Macs requires your own signing + notarization.
- arm64 only: Intel Macs require rebuilding with a different `arch` (see above).
- The app uses the default Electron icon for now; replace it by adding `build/icon.icns`.
