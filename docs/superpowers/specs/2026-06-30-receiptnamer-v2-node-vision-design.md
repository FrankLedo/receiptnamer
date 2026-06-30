# receiptnamer v2 — Node, vision-first, shareable

**Status:** Approved design (2026-06-30)
**Supersedes:** the current zsh + python3 implementation (`receiptnamer` at repo root, installed to `~/.local/bin/receiptnamer`)

## Goal

Rewrite receiptnamer as a publicly shareable Node.js CLI that names scanned
receipts by **reading the rendered receipt image with a vision-language model**
instead of OCR'd plaintext. Distributed on npm as `@frankledo/receiptnamer`,
sibling to the published `@frankledo/pdfnamer`.

## Why this rewrite

- **Accuracy:** A 2026-06-30 prototype showed text-only models (qwen2.5:7b,
  even llama3.3:70b) grab the wrong date off flattened OCR, because flattening
  discards layout — and a receipt's transaction date is positionally meaningful.
  Qwen2.5-VL 7B reading the *image* got the dates right at ~86 tok/s (7B speed).
- **Simplicity / shareability:** removes every system dependency (see below).
- **Language:** user's preferred language is Node; the current tool is zsh with
  embedded python3 heredocs. v2 is TypeScript like pdfnamer.

## Non-goals (v1)

- No OCR / text-extraction backend.
- No `claude` CLI backend — `claude --print` image input is unreliable
  (extension-based MIME detection → API 400s, Bedrock drops images, closed
  "not planned"). Reliable cloud vision requires the Anthropic API.
- No new OS integrations beyond porting the existing macOS watcher + Quick Action.

## Stack & conventions (mirror pdfnamer)

- TypeScript, ESM (`"type": "module"`), Node ≥18.
- `bin: { receiptnamer: "dist/index.js" }`; build = `tsc` + shebang inject.
- MIT, `frankledo/receiptnamer` on GitHub, `.github` CI + copilot-rereview, CHANGELOG.
- HTTP via Node 18 built-in `fetch` — **no Anthropic SDK**.

## Dependency footprint

Install for a new user: `npm install -g @frankledo/receiptnamer`.

| Old (v1) | v2 |
|---|---|
| `python3` | gone (TypeScript) |
| `ocrmypdf` (brew) | gone (no OCR) |
| `poppler`/`pdftotext` (brew) | gone |
| Homebrew | not required |

npm dependencies:
- `pdfjs-dist` — parse/rasterize PDF pages (already used by pdfnamer).
- `@napi-rs/canvas` — render target for pdfjs; ships **prebuilt per-platform
  binaries** (darwin-arm64, linux-x64, …), so no cairo/pango/brew/compiler.
- `chokidar` — cross-platform folder watching.

External (not an npm/build dep): **Ollama** — only when using the local backend.
Anthropic-backend users need only the npm install + `ANTHROPIC_API_KEY`.

## Architecture

Vision-first pipeline, no OCR:

```
PDF → render page 1 → PNG buffer (pdfjs-dist + @napi-rs/canvas)
    → Namer(image, scanDate) → raw text → cleanup → filename
    → collision-safe rename in place
```

One backend interface; backends are interchangeable implementations:

```ts
interface Namer {
  name(imagePng: Buffer, scanDate: string): Promise<string>; // returns raw model text
}
```

### Backends (both vision, local default)

- **`ollama`** *(default)* — POST the PNG (base64) in the `images` array to
  `${ollama_host}/api/generate` with `stream:false`, `options.temperature:0`.
  Default model `qwen2.5vl:7b`. No key. Unreachable → backend error.
- **`anthropic`** — Anthropic Messages API, vision content block (base64 PNG)
  + text instruction, `temperature:0`. Requires `ANTHROPIC_API_KEY` (env only).
  Default model: a cost-effective vision-capable Claude model, configurable;
  exact model id + request shape verified against the claude-api reference at
  implementation time. Missing key / API error → backend error.

### Modules (each isolated and unit-testable)

- `render.ts` — `renderFirstPage(pdfPath): Promise<Buffer>` (PNG, ~150 dpi).
- `backends/ollama.ts`, `backends/anthropic.ts` — implement `Namer`.
- `name.ts` — build the prompt, dispatch to the configured backend, clean the
  output (strip path chars / newlines / quotes / brackets, trim), and apply the
  **scan-date fallback** (see below).
- `rename.ts` — dry-run aware, collision-safe (` (2)`, ` (3)`…), in-place.
- `watch.ts` — chokidar watcher over `watch_dirs`, matching `Scanned Document*.pdf`.
- `config.ts` — load/validate/`--init` config.
- `cli.ts` / `index.ts` — arg parsing, command dispatch, summary output.
- macOS extras (optional): `--install-watcher` (launchd), `--install-quickaction`.

## The naming prompt

Same intent as the validated prototype: output ONLY the filename, format
`YYYY-MM-DD - Vendor` with optional ` - short context`; read the transaction
date from the receipt; Title Case vendor, real spaces, no ALL CAPS / underscores
/ brackets. One in-prompt example of a correct answer.

### Scan-date fallback

receiptnamer passes the file's creation date (the scan date) as a fallback. The
prompt instructs the model to use the receipt's transaction date when present and
fall back to the scan date only when there is no transaction date. This prevents
product *manuals* (no transaction) from being named with a printed publication
date (observed in the prototype: a manual got `2023-12-05`).

## Configuration

`~/.config/receiptnamer/config.json` (override via `RECEIPTNAMER_CONFIG`):

```json
{
  "watch_dirs": ["~/.../Receipts and Manuals"],
  "backend": "ollama",
  "model": "qwen2.5vl:7b",
  "ollama_host": "http://localhost:11434"
}
```

- `backend`: `"ollama"` (default) | `"anthropic"`.
- `model`: backend-specific model id.
- The Anthropic key is read only from `ANTHROPIC_API_KEY`, never stored in config.
- `--init` writes a starter config (iCloud receipts path if detected).

## Error handling

- Backend unreachable / missing key / API error → print `SKIP <file>`, fire one
  macOS notification per run, leave the file unrenamed; the watcher retries on
  its next pass. Never a silent fallback between backends.
- Render failure (corrupt/empty PDF) → `SKIP` with a clear message.
- Empty / unusable model output → `NO NAME`, skip.

## CLI surface (parity with v1)

```
receiptnamer [--dry-run] <file|dir> ...
receiptnamer --init
receiptnamer --watch-run                 # one watcher pass (used by launchd)
receiptnamer --install-watcher           # macOS launchd agent
receiptnamer --install-quickaction       # macOS Finder Quick Action
```

Summary line unchanged: `N renamed, N unchanged, N skipped`.

## Evaluation discipline (carried into tests/docs)

Do not score the model against hand-curated filenames as if they were absolute
truth. In the prototype the VLM returned "Samurai Sushi Boat" where an old
filename said "Samurai Sushi Oakland" — "Oakland" was a human annotation, not on
the receipt. The model read the document more faithfully. Evaluate against what
is on the document.

## Testing (TDD)

Unit tests (backend mocked behind `Namer`):
- prompt building (format rules present, scan-date wired in),
- output cleanup (strips brackets/quotes/newlines/path chars, trims),
- scan-date fallback selection,
- rename collision handling and dry-run no-op,
- config load / validate / defaults.

Opt-in integration test: render the committed sample receipts and assert the
configured local backend returns a well-formed `YYYY-MM-DD - Vendor` string
(skipped unless Ollama + model are present).

## Migration / rollout

- Build v2 alongside v1 in this repo; keep v1 working until v2 reaches parity.
- v2 reuses the v1 config shape (adds `model`/`ollama_host` defaults already
  present from the local-backend change), so existing users migrate by upgrading.
- Publish to npm as `@frankledo/receiptnamer`; update README for the new install
  and backend setup.
