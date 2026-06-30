# receiptnamer

Automatically rename scanned receipt PDFs using a vision-language model. Scan a
receipt with your iPhone, and it lands in your folder with a clean, searchable
name like `2026-06-15 - Nobu.pdf`.

## How it works

receiptnamer renders the **first page of the PDF to an image** and shows that
image to a vision model, which reads it the way a person would and returns a
filename: `YYYY-MM-DD - Vendor.pdf`. It does not run OCR or extract text first.

Reading the rendered page directly (rather than OCR'd text) keeps the model
layout-aware — it can tell the printed date at the top of a receipt from a
card-network timestamp buried in the footer, even on noisy thermal-printer
scans where OCR text alone loses that structure. If the receipt has no
legible date, the file's scan date (its creation date) is used as a fallback.

The file is renamed in place. A background watcher can fire automatically
whenever a new scanned file appears, so the rename typically happens within
seconds of the file syncing to your Mac.

## Install

```
npm install -g @frankledo/receiptnamer
```

Requires Node.js >=22.13.0.

## Backends

receiptnamer can read receipts with a local model via **Ollama** (default,
private, free) or with the **Anthropic API** (cloud, no local setup).

### Ollama (default)

1. [Install Ollama](https://ollama.com)
2. Pull the vision model:
   ```
   ollama pull qwen2.5vl:7b
   ```
3. That's it — receiptnamer talks to Ollama at `http://localhost:11434` by
   default. Receipts never leave your machine.

If the Ollama server is unreachable, receiptnamer leaves the file unrenamed
and reports a skip — it never silently falls back to the cloud.

### Anthropic API

Set `"backend": "anthropic"` in your config (see [Configuration](#configuration))
and export an API key in your shell environment:

```
export ANTHROPIC_API_KEY=sk-ant-...
```

The default model is `claude-haiku-4-5`. The API key is **never read from the
config file** — it must be set in the environment.

## Getting started

Create a starter config:

```
receiptnamer --init
```

This writes `~/.config/receiptnamer/config.json` with sensible defaults
(`backend: "ollama"`, model `qwen2.5vl:7b`). Edit `watch_dirs` to point at
your receipts folder(s).

## Usage

**Rename a single file:**
```
receiptnamer receipt.pdf
```

**Rename all PDFs in a folder:**
```
receiptnamer ~/Documents/Receipts/
```

**Preview renames without changing anything:**
```
receiptnamer --dry-run ~/Documents/Receipts/
```

**Output format:**
```
RENAMED Scanned Document.pdf -> 2026-06-15 - Nobu.pdf
UNCHANGED 2026-01-03 - Whole Foods.pdf
SKIP Scanned Document 3.pdf (ollama unreachable)

1 renamed, 1 unchanged, 1 skipped
```

**Other commands:**
```
receiptnamer --init                  Create a starter config
receiptnamer --watch-run             One watcher pass over configured watch_dirs
receiptnamer --watch                 Run a continuous watcher
receiptnamer --install-watcher       Install the macOS launchd watcher
receiptnamer --install-quickaction   Install the macOS Finder Quick Action
receiptnamer --help                  Show usage
```

**Options:**
- `-n, --dry-run` — show what would be renamed without touching files
- `-c, --config <path>` — use a specific config file instead of the default location

## Configuration

Config file: `~/.config/receiptnamer/config.json`

Override the path with `-c/--config` or the `RECEIPTNAMER_CONFIG` environment
variable.

```json
{
  "watch_dirs": [
    "~/Library/Mobile Documents/com~apple~CloudDocs/Receipts and Manuals"
  ],
  "backend": "ollama",
  "model": "qwen2.5vl:7b",
  "ollama_host": "http://localhost:11434"
}
```

| Key | Description |
| --- | --- |
| `watch_dirs` | List of directories to watch and scan for new receipt PDFs. |
| `backend` | `"ollama"` (default) or `"anthropic"`. |
| `model` | Model name for the chosen backend (e.g. `qwen2.5vl:7b`, `claude-haiku-4-5`). |
| `ollama_host` | Base URL for the Ollama server. Defaults to `http://localhost:11434`. |

There is no API key field in the config — the Anthropic API key is read only
from the `ANTHROPIC_API_KEY` environment variable, never stored on disk.

After changing `watch_dirs`, re-run `receiptnamer --install-watcher` to
update the installed watcher.

## macOS watcher and Quick Action

**Background watcher** — runs automatically and renames new scanned files as
they appear:

```
receiptnamer --install-watcher
```

This installs a `launchd` agent (`~/Library/LaunchAgents/com.frankledo.receiptnamer.plist`)
that runs a watch pass every 30 seconds over your configured `watch_dirs`.

**Finder Quick Action** — right-click any PDF in Finder to rename it on demand:

```
receiptnamer --install-quickaction
```

Then go to **System Settings → Privacy & Security → Extensions → Finder** and
enable "Rename Receipt". You can then right-click a PDF (or selection of
PDFs) and choose **Quick Actions → Rename Receipt**.

Both installers are macOS-only; the core CLI itself runs on any platform Node
supports.

## Scanning receipts with your iPhone

The fastest workflow uses the built-in document scanner in the **Files** app:

1. Open the **Files** app on your iPhone
2. Navigate to your receipts folder (e.g. iCloud Drive → Files → Receipts)
3. Tap the **…** button in the top-right corner
4. Tap **Scan Documents**
5. Point the camera at the receipt — the scanner auto-detects the edges and captures it
6. Tap **Save** (top-right) when done — you can scan multiple pages before saving
7. The PDF saves as `Scanned Document.pdf` directly in that folder

If you have the watcher running, the file is renamed within seconds of
syncing to your Mac. No further action needed.

> **Tip:** The Files scanner works better than the Notes or Camera app for
> receipts — it crops to the document edges and produces a cleaner PDF for
> the vision model to read.

## License

MIT
