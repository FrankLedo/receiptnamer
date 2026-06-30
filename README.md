# receiptnamer

Automatically OCR and rename scanned receipts using Claude. Scan a receipt with your iPhone, and it lands in your folder with a clean, searchable name like `2026-06-15 - Nobu - Birthday Dinner.pdf`.

## How it works

1. You scan a receipt with the iPhone Files app — it saves as `Scanned Document.pdf`
2. receiptnamer runs OCR on it (making it text-searchable) then sends the extracted text to Claude
3. Claude returns a descriptive filename: `YYYY-MM-DD - Vendor[ - context].pdf`
4. The file is renamed in place

A background watcher fires automatically whenever a new scanned file appears, so the rename typically happens within seconds of the file syncing to your Mac.

## Prerequisites

- **macOS** with iCloud Drive (or any local folder)
- **[Claude Code](https://claude.ai/code)** — the default backend; uses `claude --print`, which bills against your Claude subscription, not a separate API account
- **ocrmypdf** — adds a text layer to scanned PDFs
- **poppler** — provides `pdftotext` for text extraction
- **[Ollama](https://ollama.com)** *(optional)* — run a local model instead of Claude, so receipts never leave your Mac. See [Model backend](#model-backend).

Install dependencies with Homebrew:

```
brew install ocrmypdf poppler
```

## Installation

**1. Copy the script to your PATH**

```
cp receiptnamer ~/.local/bin/receiptnamer
chmod +x ~/.local/bin/receiptnamer
```

**2. Create a config file**

```
receiptnamer --init
```

This creates `~/.config/receiptnamer/config.json` pre-filled with your iCloud receipts path (if detected) or `~/Documents/Receipts` otherwise. Edit it to point to your actual receipts folder.

**3. Install the background watcher** *(optional but recommended)*

```
receiptnamer --install-watcher
```

This installs a launchd agent that watches your receipts folder and renames new scanned files automatically. It fires on filesystem events (near-instant) with a 5-minute polling fallback.

**4. Install the Finder Quick Action** *(optional)*

```
receiptnamer --install-quickaction
```

Then go to **System Settings → Privacy & Security → Extensions → Finder** and enable "Rename with receiptnamer". You can then right-click any PDF or folder in Finder to rename it.

## Scanning receipts with your iPhone

The fastest workflow uses the built-in document scanner in the **Files** app:

1. Open the **Files** app on your iPhone
2. Navigate to your receipts folder (e.g. iCloud Drive → Files → 2026 → Receipts and Manuals)
3. Tap the **…** button in the top-right corner
4. Tap **Scan Documents**
5. Point the camera at the receipt — the scanner auto-detects the edges and captures it
6. Tap **Save** (top-right) when done — you can scan multiple pages before saving
7. The PDF saves as `Scanned Document.pdf` directly in that folder

If you have the watcher running, the file will be renamed within seconds of syncing to your Mac. No further action needed.

> **Tip:** The Files scanner works better than the Notes or Camera app for receipts — it crops to the document edges and produces a cleaner PDF.

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
RENAME    Scanned Document.pdf
          → 2026-06-15 - Nobu - Birthday Dinner.pdf

UNCHANGED 2026-01-03 - Whole Foods.pdf
NO TEXT   Scanned Document 3.pdf   ← OCR failed, try --force-ocr

3 renamed, 1 unchanged, 1 skipped
```

## Configuration

Config file: `~/.config/receiptnamer/config.json`

Override the path with the `RECEIPTNAMER_CONFIG` environment variable.

```json
{
  "watch_dirs": [
    "~/Library/Mobile Documents/com~apple~CloudDocs/Files/*/Receipts and Manuals"
  ]
}
```

`watch_dirs` is a list of directories to watch and scan. Shell globs are supported — the `*` in the default path matches any year folder, so new year folders are picked up automatically without editing the config.

**Multiple folders:**
```json
{
  "watch_dirs": [
    "~/Library/Mobile Documents/com~apple~CloudDocs/Files/*/Receipts and Manuals",
    "~/Documents/Receipts"
  ]
}
```

After changing `watch_dirs`, re-run `receiptnamer --install-watcher` to update the watcher.

### Model backend

receiptnamer can name receipts with either cloud Claude (default) or a local
[Ollama](https://ollama.com) model. Control this with two config keys:

```json
{
  "watch_dirs": ["..."],
  "backend": "claude",
  "model": "qwen2.5:7b"
}
```

- `backend`: `"claude"` (default) or `"ollama"`. If the key is absent, Claude is used.
- `model`: the Ollama model name, used only when `backend` is `"ollama"` (e.g. `"qwen2.5:7b"`, `"llama3.3:70b"`).
- `ollama_host` *(optional)*: defaults to `http://localhost:11434`.

**Why local?** Receipts are financial documents — the `ollama` backend keeps them
entirely on-device and works offline, with no API/subscription cost.

**Tradeoff:** local models are less accurate at pulling the right date off a noisy
OCR scan. In testing, `llama3.3:70b` came close to Claude while `qwen2.5:7b` was
fast but often picked the wrong date. Claude remains the default for accuracy;
switch to `ollama` when privacy or offline operation matters more.

If `backend` is `ollama` but the Ollama server is unreachable, receiptnamer leaves
the file unrenamed, shows a macOS notification, and the watcher retries on its next
pass — it never silently falls back to the cloud.

## Date handling

receiptnamer tries to extract the date from the receipt text. If no date is found (common with credit card terminal printouts), it falls back to the **file creation date**, which is the date you scanned it — almost always the right date for receipts.

## Limitations

- **Credit card terminal receipts** (the small printed slip you sign) often don't have the merchant name in machine-readable text — it's part of a printed graphic. These will get a generic name like `2026-06-15 - Visa Credit.pdf` and may need manual correction.
- **Image-only PDFs** that fail OCR are reported as `NO TEXT` and skipped. Try opening and re-saving the PDF from Preview, or use `ocrmypdf --force-ocr` directly.
- Requires macOS (the watcher and Quick Action use macOS-specific tools). The CLI works on Linux with minor path adjustments.

## Watcher log

```
tail -f ~/Library/Logs/receiptnamer-watcher.log
```

## License

MIT
