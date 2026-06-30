# receiptnamer v2 (Node, vision-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite receiptnamer as a shareable Node/TypeScript CLI that names scanned receipt PDFs by reading the *rendered page image* with a vision-language model (local Ollama or the Anthropic API), replacing the v1 zsh+python OCR-text tool.

**Architecture:** `PDF → render page 1 to a PNG buffer (pdfjs-dist + @napi-rs/canvas) → Namer(image, scanDate) → raw model text → cleanup → collision-safe in-place rename`. Two interchangeable `Namer` backends sit behind one interface; everything else (render, prompt, cleanup, rename, watch, CLI) is backend-agnostic and unit-tested with the backend mocked.

**Tech Stack:** TypeScript (ESM), Node ≥18.3.0, `pdfjs-dist`, `@napi-rs/canvas`, `chokidar`, native `fetch` (no Anthropic SDK), `node:test` for tests. Mirrors the sibling `@frankledo/pdfnamer` conventions (build = `tsc` + inline shebang inject, `node:util` `parseArgs`, release-please + npm OIDC publish, `.npmignore`-based packaging).

## Global Constraints

These apply to **every** task. Values are copied verbatim from the spec and the verified pdfnamer conventions.

- **Language/module:** TypeScript, ESM (`"type": "module"`). Relative imports in source MUST use explicit `.js` extensions (e.g. `import { renderFirstPage } from "./render.js"`) so compiled output resolves at runtime under Node ESM.
- **Node floor:** `"engines": { "node": ">=22.13.0" }` — **required by `pdfjs-dist@6.1.200`** (its own engines: `>=22.13.0 || >=24`). Also comfortably satisfies `node:util` `parseArgs` (≥18.3). Node 18/20 are NOT supported.
- **Bin:** `"bin": { "receiptnamer": "dist/index.js" }`. Build = `tsc` then an inline `node -e` step that prepends `#!/usr/bin/env node` and `chmod 755`s `dist/index.js` (verbatim pattern below).
- **Dependencies (runtime):** `pdfjs-dist@^6.1.200`, `@napi-rs/canvas@^1.0.2`, `chokidar@^4.0.0`. **Dev:** `@types/node@^22.0.0`, `typescript@^5.0.0`. No other runtime deps. **No Anthropic SDK** — HTTP via the Node built-in `fetch`.
- **Anthropic key:** read ONLY from `process.env.ANTHROPIC_API_KEY`. NEVER read from or write to the config file.
- **Default models:** ollama backend → `qwen2.5vl:7b`; anthropic backend → `claude-haiku-4-5` (cheapest vision-capable Claude model). Both overridable via the config `model` key.
- **Model determinism:** every model call uses temperature `0`.
- **Config:** default path `~/.config/receiptnamer/config.json`; override precedence `--config/-c <path>` > `RECEIPTNAMER_CONFIG` env > default path. Shallow-merge user config over defaults. `~` expanded via `os.homedir()`.
- **Filename format:** `YYYY-MM-DD - Vendor` with optional ` - short context`; Title Case vendor, real spaces, no ALL CAPS / underscores / brackets / path separators.
- **Errors:** backend unreachable / missing key / API error / render failure → print `SKIP <file>`, fire ONE macOS desktop notification per run, leave the file unrenamed. Empty/unusable model output → `NO NAME`, skip. Never silently fall back between backends.
- **Licensing/repo:** MIT, GitHub `frankledo/receiptnamer`. `.github` ships `ci.yml`, `release-please.yml`, `copilot-rereview.yml`.
- **Packaging:** controlled by `.npmignore` (no `files` array). Published tarball = `dist/`, `package.json`, `README.md`, `LICENSE`.
- **Commits:** every task ends with a commit. Conventional Commits style (`feat:`, `test:`, `chore:`) — release-please depends on it.

**Coexistence note:** v2 is added at the repo root *alongside* the existing v1 zsh script `receiptnamer` (which stays until v2 reaches parity). The new `package.json`, `src/`, `tsconfig*.json`, and `tests/` do not collide with any v1 file.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | npm metadata, bin, scripts, deps (mirrors pdfnamer). |
| `tsconfig.json` | publish build → `dist/` (src only). |
| `tsconfig.test.json` | test build → `build-test/` (src + tests). |
| `.gitignore` / `.npmignore` | ignore build output / control tarball. |
| `LICENSE` | MIT. |
| `src/index.ts` | CLI entry: `parseArgs`, command dispatch, run summary. |
| `src/config.ts` | `Config` type, defaults, `loadConfig`, `initConfig`, `expandHome`, `getScanDate`. |
| `src/render.ts` | `renderFirstPage(pdfPath, maxEdge?) → Promise<Buffer>` (PNG). |
| `src/prompt.ts` | `buildPrompt(scanDate) → string`. |
| `src/name.ts` | `cleanName(raw) → string`, `processFile(...)` orchestration. |
| `src/rename.ts` | `uniqueTarget(dir, base) → string`, `renameInPlace(...)`. |
| `src/notify.ts` | `notifyOnce(message)` macOS desktop notification (once per run). |
| `src/backends/types.ts` | `Namer` interface, `Backend` config union. |
| `src/backends/ollama.ts` | `OllamaNamer` implements `Namer`. |
| `src/backends/anthropic.ts` | `AnthropicNamer` implements `Namer`. |
| `src/backends/factory.ts` | `createNamer(config) → Namer`. |
| `src/watch.ts` | `runWatchPass(...)` + `watch(...)` chokidar watcher. |
| `src/macos.ts` | `installWatcher()` (launchd), `installQuickAction()` (Automator). |
| `tests/*.test.ts` | `node:test` unit/integration tests. |
| `tests/fixtures/sample-receipt.pdf` | committed real scanned receipt (already in repo). |
| `.github/workflows/{ci,release-please,copilot-rereview}.yml` | CI + release + Copilot re-review. |

---

## Task 1: Project scaffolding + toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `.gitignore`, `.npmignore`, `LICENSE`
- Create: `src/smoke.ts`, `tests/smoke.test.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run build` and `npm test`. Establishes that ESM + `node:test` + the test build pipeline run green.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@frankledo/receiptnamer",
  "version": "0.1.0",
  "description": "Name scanned receipt PDFs by reading the rendered image with a vision-language model (local Ollama or Anthropic API)",
  "license": "MIT",
  "homepage": "https://github.com/frankledo/receiptnamer#readme",
  "bugs": { "url": "https://github.com/frankledo/receiptnamer/issues" },
  "author": "Frank Ledo <frank@frankledo.com>",
  "type": "module",
  "bin": { "receiptnamer": "dist/index.js" },
  "keywords": ["receipt","rename","scan","vision","ollama","anthropic","cli","automation","pdf"],
  "repository": { "type": "git", "url": "git+https://github.com/frankledo/receiptnamer.git" },
  "engines": { "node": ">=22.13.0" },
  "scripts": {
    "build": "tsc && node -e \"const fs=require('fs'); const f='dist/index.js'; let c=fs.readFileSync(f,'utf8'); if(c.startsWith('#!')) c=c.slice(c.indexOf('\\n')+1); fs.writeFileSync(f, '#!/usr/bin/env node\\n'+c); fs.chmodSync(f, '755')\"",
    "prepublishOnly": "npm run build",
    "test": "tsc -p tsconfig.test.json && node --test \"build-test/tests/\"",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@napi-rs/canvas": "^1.0.2",
    "chokidar": "^4.0.0",
    "pdfjs-dist": "^6.1.200"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`** (publish build — src only → `dist/`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "build-test"]
}
```

> Note: `include` is `src/**` only, so tsc's inferred rootDir is `src/` and the entry compiles to `dist/index.js` (matching `bin`). Do NOT add `rootDir` or include `tests/` here — that would shift output to `dist/src/index.js` and break the bin path.

- [ ] **Step 3: Write `tsconfig.test.json`** (test build — src + tests → `build-test/`)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "build-test",
    "noEmit": false
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", "build-test"]
}
```

> With both `src/` and `tests/` included, the inferred rootDir is the project root, so output is `build-test/src/...` and `build-test/tests/...`. Test files import the code under test via relative paths that resolve after compilation (e.g. from `tests/foo.test.ts` import `"../src/foo.js"` → at runtime `build-test/tests/foo.test.js` imports `build-test/src/foo.js`).

- [ ] **Step 4: Write `.gitignore` and `.npmignore`**

`.gitignore`:
```
node_modules/
dist/
build-test/
.DS_Store
~/testoutput.txt
```

`.npmignore`:
```
# TypeScript source (compiled output in dist/ is what ships)
src/
tests/
build-test/
# Claude Code session data
.claude/
# GitHub Actions
.github/
# TypeScript config
tsconfig.json
tsconfig*.json
# Docs (README is kept; everything else excluded)
CHANGELOG.md
docs/
# v1 artifacts (not part of the npm package)
receiptnamer
install.sh
# Git / OS
.gitignore
.DS_Store
```

- [ ] **Step 5: Write `LICENSE`** (MIT, copyright `2026 Frank Ledo`). Use the standard MIT text.

- [ ] **Step 6: Write the smoke source and test**

`src/smoke.ts`:
```ts
export function ok(): true {
  return true;
}
```

`tests/smoke.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ok } from "../src/smoke.js";

test("toolchain runs and ESM imports resolve", () => {
  assert.equal(ok(), true);
});
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no errors. `@napi-rs/canvas` pulls a prebuilt darwin-arm64 binary (no compiler).

- [ ] **Step 8: Run the build and test to verify the toolchain**

Run: `npm run build`
Expected: `dist/index.js` does NOT yet exist (no `src/index.ts` yet) — the shebang step will fail. **Therefore for this task only**, temporarily verify compilation with `npx tsc` (compiles `src/smoke.ts` → `dist/smoke.js`) and skip the full `build` script until Task 10 creates `src/index.ts`. Confirm `dist/smoke.js` exists.

Run: `npm test`
Expected: `tsc -p tsconfig.test.json` compiles, then `node --test` reports `tests 1`, `pass 1`, `fail 0`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.test.json .gitignore .npmignore LICENSE src/smoke.ts tests/smoke.test.ts
git commit -m "chore: scaffold Node/TS project with node:test toolchain"
```

---

## Task 2: PDF page rendering (`render.ts`)

**Files:**
- Create: `src/render.ts`
- Test: `tests/render.test.ts`
- Uses: `tests/fixtures/sample-receipt.pdf` (already committed in the repo)

**Interfaces:**
- Consumes: nothing.
- Produces: `renderFirstPage(pdfPath: string, maxEdge?: number): Promise<Buffer>` — returns a PNG buffer of page 1, scaled so its longest edge is `maxEdge` px (default `2048`). Throws on a corrupt/unreadable PDF.

> **Verified:** the code below was spiked against the four real sample receipts on 2026-06-30 with `pdfjs-dist@6.1.200` + `@napi-rs/canvas@1.0.2` on Node 26. Output PNGs were valid (PNG magic bytes) at 820×2048 … 1457×2048, ~1.4–1.9 MB each.

- [ ] **Step 1: Write the failing test**

`tests/render.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderFirstPage } from "../src/render.js";

const here = dirname(fileURLToPath(import.meta.url));
// build-test/tests/ -> repo tests/fixtures via the source tree is not copied,
// so resolve the fixture relative to the repo root (two levels up from build-test/tests).
const fixture = join(here, "..", "..", "tests", "fixtures", "sample-receipt.pdf");

test("renders page 1 to a PNG buffer with a capped long edge", async () => {
  const png = await renderFirstPage(fixture, 2048);
  // PNG magic number: 89 50 4E 47
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.equal(png[2], 0x4e);
  assert.equal(png[3], 0x47);
  assert.ok(png.length > 1000, "expected a non-trivial image");
});

test("throws on an unreadable PDF", async () => {
  await assert.rejects(() => renderFirstPage("/no/such/file.pdf", 2048));
});
```

> Fixture path note: tests compile to `build-test/tests/render.test.js`. `tests/fixtures/` is NOT compiled (it's not `.ts`), so it stays at the repo root. From `build-test/tests/` the repo root is two `..` up; hence `join(here, "..", "..", "tests", "fixtures", "sample-receipt.pdf")`. Verify this resolves before implementing — if your layout differs, adjust the relative depth, do not move the fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module ".../src/render.js"` (render.ts not written yet).

- [ ] **Step 3: Write the implementation**

`src/render.ts`:
```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs-dist needs a worker even in Node; point it at the bundled legacy worker.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

/**
 * Render page 1 of a PDF to a PNG buffer, scaled so the longest edge is `maxEdge`
 * pixels. iPhone scans have large native page dimensions, so a fixed DPI yields
 * unpredictably huge images; a long-edge budget keeps cost bounded (Anthropic
 * downscales to <=1568px anyway, and Ollama stays fast) while preserving detail.
 */
export async function renderFirstPage(pdfPath: string, maxEdge = 2048): Promise<Buffer> {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = maxEdge / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const context = canvas.getContext("2d");
  // pdfjs v6 in Node: pass canvasContext, viewport, and the canvas itself.
  await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  return canvas.toBuffer("image/png");
}
```

> If TypeScript complains about the `page.render` argument types (pdfjs DOM types vs @napi-rs/canvas types), the `as unknown as ...` casts above resolve it; do not change the runtime shape — it is the verified working call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — both render tests green.

- [ ] **Step 5: Commit**

```bash
git add src/render.ts tests/render.test.ts tests/fixtures/sample-receipt.pdf
git commit -m "feat: render PDF page 1 to a long-edge-capped PNG buffer"
```

---

## Task 3: Configuration (`config.ts`)

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Backend = "ollama" | "anthropic"`
  - `interface Config { watch_dirs: string[]; backend: Backend; model: string; ollama_host: string }`
  - `const DEFAULT_CONFIG: Config`
  - `function expandHome(p: string): string`
  - `function getDefaultConfigPath(): string`
  - `function resolveConfigPath(flag?: string): string`
  - `function loadConfig(flag?: string): Config`
  - `function initConfig(flag?: string): void`
  - `function getScanDate(filePath: string): string` — file birthtime (fallback mtime) as `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

`tests/config.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  expandHome,
  resolveConfigPath,
  loadConfig,
  getScanDate,
} from "../src/config.js";

test("expandHome expands a leading ~", () => {
  assert.equal(expandHome("~/x"), join(homedir(), "x"));
  assert.equal(expandHome("/abs/x"), "/abs/x");
});

test("resolveConfigPath precedence: flag > env > default", () => {
  assert.equal(resolveConfigPath("/flag.json"), "/flag.json");
  process.env.RECEIPTNAMER_CONFIG = "/env.json";
  assert.equal(resolveConfigPath(undefined), "/env.json");
  delete process.env.RECEIPTNAMER_CONFIG;
  assert.ok(resolveConfigPath(undefined).endsWith("/.config/receiptnamer/config.json"));
});

test("loadConfig shallow-merges user over defaults and returns defaults when missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const p = join(dir, "config.json");
  writeFileSync(p, JSON.stringify({ backend: "anthropic", model: "claude-haiku-4-5" }));
  const cfg = loadConfig(p);
  assert.equal(cfg.backend, "anthropic");
  assert.equal(cfg.model, "claude-haiku-4-5");
  assert.equal(cfg.ollama_host, DEFAULT_CONFIG.ollama_host); // untouched default
  const missing = loadConfig(join(dir, "nope.json"));
  assert.deepEqual(missing, DEFAULT_CONFIG);
});

test("getScanDate returns the file date as YYYY-MM-DD", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const p = join(dir, "f.pdf");
  writeFileSync(p, "x");
  const d = getScanDate(p);
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  // sanity: matches the file's own birthtime/mtime year
  const st = statSync(p);
  const expectedYear = String((st.birthtime.getTime() ? st.birthtime : st.mtime).getFullYear());
  assert.ok(d.startsWith(expectedYear));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module ".../src/config.js"`.

- [ ] **Step 3: Write the implementation**

`src/config.ts`:
```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type Backend = "ollama" | "anthropic";

export interface Config {
  watch_dirs: string[];
  backend: Backend;
  model: string;
  ollama_host: string;
}

export const DEFAULT_CONFIG: Config = {
  watch_dirs: [],
  backend: "ollama",
  model: "qwen2.5vl:7b",
  ollama_host: "http://localhost:11434",
};

// Default model per backend (used when --init writes a starter file or when a
// user switches backend without setting model). DEFAULT_CONFIG.model is the
// ollama default; anthropic's default is applied in the anthropic backend.
export const DEFAULT_MODELS: Record<Backend, string> = {
  ollama: "qwen2.5vl:7b",
  anthropic: "claude-haiku-4-5",
};

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return homedir() + p.slice(1);
  return p;
}

export function getDefaultConfigPath(): string {
  return join(homedir(), ".config", "receiptnamer", "config.json");
}

export function resolveConfigPath(flag?: string): string {
  if (flag) return expandHome(flag);
  if (process.env.RECEIPTNAMER_CONFIG) return expandHome(process.env.RECEIPTNAMER_CONFIG);
  return getDefaultConfigPath();
}

export function loadConfig(flag?: string): Config {
  const p = resolveConfigPath(flag);
  if (!existsSync(p)) {
    console.warn(`No config at ${p} — run 'receiptnamer --init' to create one. Using defaults.`);
    return DEFAULT_CONFIG;
  }
  try {
    const user = JSON.parse(readFileSync(p, "utf8")) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...user };
  } catch (e: unknown) {
    console.error(`Config parse error: ${(e as Error).message}. Using defaults.`);
    return DEFAULT_CONFIG;
  }
}

export function initConfig(flag?: string): void {
  const p = resolveConfigPath(flag);
  if (existsSync(p)) {
    console.log(`Config already exists at ${p}`);
    return;
  }
  // Pre-fill the common iCloud "Receipts and Manuals" path if it exists.
  const guess = join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Receipts and Manuals");
  const sample: Config = {
    ...DEFAULT_CONFIG,
    watch_dirs: existsSync(guess) ? [guess] : ["~/Documents/Receipts"],
  };
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(sample, null, 2) + "\n");
  console.log(`Created sample config at ${p}`);
}

/** File creation date (birthtime, falling back to mtime) as YYYY-MM-DD, local time. */
export function getScanDate(filePath: string): string {
  const st = statSync(filePath);
  const d = st.birthtime.getTime() ? st.birthtime : st.mtime;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all config tests green (plus prior tasks).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config load/init, path precedence, and scan-date helper"
```

---

## Task 4: Prompt + output cleanup (`prompt.ts`, `name.ts` cleanup)

**Files:**
- Create: `src/prompt.ts`
- Create: `src/name.ts` (cleanup half only; `processFile` added in Task 8)
- Test: `tests/prompt.test.ts`, `tests/name.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildPrompt(scanDate: string): string` — the naming instruction, with the scan date wired in as the fallback date.
  - `cleanName(raw: string): string` — strip path chars / newlines / quotes / square brackets, collapse whitespace, trim, drop a trailing extension if the model added one.

- [ ] **Step 1: Write the failing tests**

`tests/prompt.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../src/prompt.js";

test("prompt states the format and wires in the scan-date fallback", () => {
  const p = buildPrompt("2026-01-18");
  assert.match(p, /YYYY-MM-DD - Vendor/);
  assert.match(p, /2026-01-18/);            // fallback date present
  assert.match(p, /transaction date/i);     // instructs reading the receipt date
  assert.match(p, /Title Case/i);
  assert.match(p, /only the filename/i);
});
```

`tests/name.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName } from "../src/name.js";

test("cleanName strips brackets, quotes, newlines, slashes and trims", () => {
  assert.equal(cleanName('"2026-01-18 - Samurai Sushi"\n'), "2026-01-18 - Samurai Sushi");
  assert.equal(cleanName("[2026-01-18] - Foo/Bar"), "2026-01-18 - Foo-Bar");
  assert.equal(cleanName("2026-01-02 - Hobnob.pdf"), "2026-01-02 - Hobnob");
  assert.equal(cleanName("  a   b  "), "a b");
});

test("cleanName returns empty string for empty/whitespace input", () => {
  assert.equal(cleanName("   \n "), "");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/prompt.js` / `src/name.js` not found.

- [ ] **Step 3: Write the implementations**

`src/prompt.ts`:
```ts
export function buildPrompt(scanDate: string): string {
  return `You name scanned receipt files from the image. Output ONLY the filename: no extension, no path, no quotes, no explanation, no square brackets.

Format: YYYY-MM-DD - Vendor
You may append ' - short context' only when clearly useful (e.g. ' - dinner').

Rules:
- Read the transaction date FROM the receipt and use it. If there is truly no transaction date on the document (e.g. a product manual), use ${scanDate} as the date — never guess a date.
- Use the real merchant/vendor name in Title Case with normal spaces. Never use ALL CAPS, underscores, or square brackets.

Example of a correct answer: 2026-01-18 - Samurai Sushi - dinner`;
}
```

`src/name.ts`:
```ts
/**
 * Normalize raw model output into a safe filename stem (no extension).
 * Strips square brackets, quotes, and newlines; replaces path separators with
 * '-'; collapses whitespace; drops a trailing .pdf the model may have added.
 */
export function cleanName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[\r\n]+/g, " ");        // newlines -> space
  s = s.replace(/[\[\]"'`]/g, "");        // brackets and quotes
  s = s.replace(/[\/\\]/g, "-");          // path separators -> hyphen
  s = s.replace(/\.pdf$/i, "");           // stray extension
  s = s.replace(/\s+/g, " ").trim();      // collapse + trim
  return s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.ts src/name.ts tests/prompt.test.ts tests/name.test.ts
git commit -m "feat: naming prompt and model-output cleanup"
```

---

## Task 5: Backend interface + Ollama backend (`backends/types.ts`, `backends/ollama.ts`)

**Files:**
- Create: `src/backends/types.ts`, `src/backends/ollama.ts`
- Test: `tests/ollama.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Namer { name(imagePng: Buffer, scanDate: string): Promise<string> }`
  - `class OllamaNamer implements Namer` — constructor `(opts: { host: string; model: string; fetchImpl?: typeof fetch })`. POSTs to `${host}/api/generate` with `{ model, prompt, images: [b64], stream: false, options: { temperature: 0 } }`; returns `response` trimmed. Throws on non-OK HTTP or fetch failure.

> `fetchImpl` is an injection seam for tests — defaults to the global `fetch`. Same pattern in the anthropic backend.

- [ ] **Step 1: Write the failing test**

`tests/ollama.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaNamer } from "../src/backends/ollama.js";

function fakeFetch(captured: { body?: any; url?: string }, response: any, okFlag = true): typeof fetch {
  return (async (url: any, init: any) => {
    captured.url = String(url);
    captured.body = JSON.parse(init.body);
    return {
      ok: okFlag,
      status: okFlag ? 200 : 500,
      async json() { return response; },
      async text() { return JSON.stringify(response); },
    };
  }) as unknown as typeof fetch;
}

test("OllamaNamer posts the image+prompt and returns the response", async () => {
  const captured: any = {};
  const namer = new OllamaNamer({
    host: "http://localhost:11434",
    model: "qwen2.5vl:7b",
    fetchImpl: fakeFetch(captured, { response: " 2026-01-18 - Samurai Sushi \n" }),
  });
  const out = await namer.name(Buffer.from("PNGDATA"), "2026-01-18");
  assert.equal(out, "2026-01-18 - Samurai Sushi");
  assert.equal(captured.url, "http://localhost:11434/api/generate");
  assert.equal(captured.body.model, "qwen2.5vl:7b");
  assert.equal(captured.body.stream, false);
  assert.equal(captured.body.options.temperature, 0);
  assert.equal(captured.body.images[0], Buffer.from("PNGDATA").toString("base64"));
  assert.match(captured.body.prompt, /2026-01-18/);
});

test("OllamaNamer throws on a non-OK response", async () => {
  const captured: any = {};
  const namer = new OllamaNamer({
    host: "http://localhost:11434",
    model: "qwen2.5vl:7b",
    fetchImpl: fakeFetch(captured, { error: "boom" }, false),
  });
  await assert.rejects(() => namer.name(Buffer.from("x"), "2026-01-01"), /ollama/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — backend modules not found.

- [ ] **Step 3: Write the implementations**

`src/backends/types.ts`:
```ts
export interface Namer {
  /** Return the model's raw filename text (un-cleaned) for the given page image. */
  name(imagePng: Buffer, scanDate: string): Promise<string>;
}
```

`src/backends/ollama.ts`:
```ts
import type { Namer } from "./types.js";
import { buildPrompt } from "../prompt.js";

export interface OllamaOptions {
  host: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OllamaNamer implements Namer {
  private readonly host: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaOptions) {
    this.host = opts.host.replace(/\/$/, "");
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async name(imagePng: Buffer, scanDate: string): Promise<string> {
    const url = `${this.host}/api/generate`;
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: buildPrompt(scanDate),
          images: [imagePng.toString("base64")],
          stream: false,
          options: { temperature: 0 },
        }),
      });
    } catch (e: unknown) {
      throw new Error(`ollama: cannot reach ${url} — ${(e as Error).message}`);
    }
    if (!res.ok) {
      throw new Error(`ollama: HTTP ${res.status} from ${url}`);
    }
    const data = (await res.json()) as { response?: string };
    return (data.response ?? "").trim();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backends/types.ts src/backends/ollama.ts tests/ollama.test.ts
git commit -m "feat: Namer interface and Ollama vision backend"
```

---

## Task 6: Anthropic backend (`backends/anthropic.ts`)

**Files:**
- Create: `src/backends/anthropic.ts`
- Test: `tests/anthropic.test.ts`

**Interfaces:**
- Consumes: `Namer` (Task 5), `buildPrompt` (Task 4).
- Produces: `class AnthropicNamer implements Namer` — constructor `(opts: { model: string; apiKey?: string; fetchImpl?: typeof fetch })`. POSTs to `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body carries one user message whose content is `[ {type:"image", source:{type:"base64", media_type:"image/png", data}}, {type:"text", text: prompt} ]`, `temperature: 0`, `max_tokens: 64`. Returns the first text block, trimmed. Throws when `ANTHROPIC_API_KEY` is absent or on a non-OK response.

> Model default `claude-haiku-4-5` is supplied by the factory (Task 9); this class takes whatever `model` it's given. `apiKey` defaults to `process.env.ANTHROPIC_API_KEY` — never read from config.

- [ ] **Step 1: Write the failing test**

`tests/anthropic.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AnthropicNamer } from "../src/backends/anthropic.js";

function fakeFetch(captured: any, response: any, okFlag = true): typeof fetch {
  return (async (url: any, init: any) => {
    captured.url = String(url);
    captured.headers = init.headers;
    captured.body = JSON.parse(init.body);
    return {
      ok: okFlag,
      status: okFlag ? 200 : 400,
      async json() { return response; },
      async text() { return JSON.stringify(response); },
    };
  }) as unknown as typeof fetch;
}

test("AnthropicNamer sends an image block + text and returns the text", async () => {
  const captured: any = {};
  const namer = new AnthropicNamer({
    model: "claude-haiku-4-5",
    apiKey: "sk-test",
    fetchImpl: fakeFetch(captured, { content: [{ type: "text", text: " 2026-01-18 - Samurai Sushi " }] }),
  });
  const out = await namer.name(Buffer.from("PNGDATA"), "2026-01-18");
  assert.equal(out, "2026-01-18 - Samurai Sushi");
  assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
  assert.equal(captured.headers["x-api-key"], "sk-test");
  assert.equal(captured.headers["anthropic-version"], "2023-06-01");
  assert.equal(captured.body.model, "claude-haiku-4-5");
  assert.equal(captured.body.temperature, 0);
  const content = captured.body.messages[0].content;
  assert.equal(content[0].type, "image");
  assert.equal(content[0].source.type, "base64");
  assert.equal(content[0].source.media_type, "image/png");
  assert.equal(content[0].source.data, Buffer.from("PNGDATA").toString("base64"));
  assert.equal(content[1].type, "text");
  assert.match(content[1].text, /2026-01-18/);
});

test("AnthropicNamer throws when the API key is missing", async () => {
  const namer = new AnthropicNamer({ model: "claude-haiku-4-5", apiKey: "" });
  await assert.rejects(() => namer.name(Buffer.from("x"), "2026-01-01"), /ANTHROPIC_API_KEY/);
});

test("AnthropicNamer throws on a non-OK response", async () => {
  const captured: any = {};
  const namer = new AnthropicNamer({
    model: "claude-haiku-4-5",
    apiKey: "sk-test",
    fetchImpl: fakeFetch(captured, { error: { message: "bad" } }, false),
  });
  await assert.rejects(() => namer.name(Buffer.from("x"), "2026-01-01"), /anthropic/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/backends/anthropic.js` not found.

- [ ] **Step 3: Write the implementation**

`src/backends/anthropic.ts`:
```ts
import type { Namer } from "./types.js";
import { buildPrompt } from "../prompt.js";

export interface AnthropicOptions {
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

export class AnthropicNamer implements Namer {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async name(imagePng: Buffer, scanDate: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("anthropic: ANTHROPIC_API_KEY is not set");
    }
    const url = "https://api.anthropic.com/v1/messages";
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 64,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: imagePng.toString("base64") },
                },
                { type: "text", text: buildPrompt(scanDate) },
              ],
            },
          ],
        }),
      });
    } catch (e: unknown) {
      throw new Error(`anthropic: request failed — ${(e as Error).message}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`anthropic: HTTP ${res.status} ${detail}`);
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    return text.trim();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backends/anthropic.ts tests/anthropic.test.ts
git commit -m "feat: Anthropic vision backend (claude-haiku-4-5 default via factory)"
```

---

## Task 7: Collision-safe in-place rename (`rename.ts`)

**Files:**
- Create: `src/rename.ts`
- Test: `tests/rename.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `uniqueTarget(dir: string, stem: string, ext: string): string` — returns an absolute path that does not collide, suffixing ` (2)`, ` (3)`… as needed.
  - `renameInPlace(srcPath: string, stem: string, opts: { dryRun: boolean }): { from: string; to: string; renamed: boolean }` — renames the file to `stem` + original extension in the same directory; dry-run computes the target without touching disk; a no-op if the name is already correct.

- [ ] **Step 1: Write the failing test**

`tests/rename.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uniqueTarget, renameInPlace } from "../src/rename.js";

test("uniqueTarget suffixes on collision", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  writeFileSync(join(dir, "a.pdf"), "x");
  assert.equal(uniqueTarget(dir, "a", ".pdf"), join(dir, "a (2).pdf"));
  writeFileSync(join(dir, "a (2).pdf"), "x");
  assert.equal(uniqueTarget(dir, "a", ".pdf"), join(dir, "a (3).pdf"));
  assert.equal(uniqueTarget(dir, "b", ".pdf"), join(dir, "b.pdf"));
});

test("renameInPlace renames and is collision-safe", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const src = join(dir, "Scanned Document.pdf");
  writeFileSync(src, "x");
  const r = renameInPlace(src, "2026-01-18 - Samurai Sushi", { dryRun: false });
  assert.equal(r.renamed, true);
  assert.ok(existsSync(join(dir, "2026-01-18 - Samurai Sushi.pdf")));
  assert.ok(!existsSync(src));
});

test("renameInPlace dry-run computes target without touching disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const src = join(dir, "Scanned Document.pdf");
  writeFileSync(src, "x");
  const r = renameInPlace(src, "2026-01-18 - Foo", { dryRun: true });
  assert.equal(r.to, join(dir, "2026-01-18 - Foo.pdf"));
  assert.ok(existsSync(src), "source must remain untouched in dry-run");
});

test("renameInPlace is a no-op when already correctly named", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const src = join(dir, "2026-01-18 - Foo.pdf");
  writeFileSync(src, "x");
  const r = renameInPlace(src, "2026-01-18 - Foo", { dryRun: false });
  assert.equal(r.renamed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/rename.js` not found.

- [ ] **Step 3: Write the implementation**

`src/rename.ts`:
```ts
import { existsSync, renameSync } from "node:fs";
import { dirname, extname, join, basename } from "node:path";

export function uniqueTarget(dir: string, stem: string, ext: string): string {
  let candidate = join(dir, `${stem}${ext}`);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (${n})${ext}`);
    n++;
  }
  return candidate;
}

export function renameInPlace(
  srcPath: string,
  stem: string,
  opts: { dryRun: boolean }
): { from: string; to: string; renamed: boolean } {
  const dir = dirname(srcPath);
  const ext = extname(srcPath) || ".pdf";
  const currentStem = basename(srcPath, ext);
  if (currentStem === stem) {
    return { from: srcPath, to: srcPath, renamed: false };
  }
  const to = uniqueTarget(dir, stem, ext);
  if (!opts.dryRun) {
    renameSync(srcPath, to);
  }
  return { from: srcPath, to, renamed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rename.ts tests/rename.test.ts
git commit -m "feat: collision-safe in-place rename with dry-run"
```

---

## Task 8: Single-file orchestration (`name.ts` → `processFile`)

**Files:**
- Modify: `src/name.ts` (add `processFile`)
- Test: `tests/process.test.ts`

**Interfaces:**
- Consumes: `renderFirstPage` (Task 2), `getScanDate` (Task 3), `cleanName` (Task 4), `Namer` (Task 5), `renameInPlace` (Task 7).
- Produces:
  - `type FileOutcome = "renamed" | "unchanged" | "skipped" | "no-name"`
  - `interface ProcessResult { file: string; outcome: FileOutcome; to?: string; reason?: string }`
  - `async function processFile(pdfPath: string, deps: { namer: Namer; dryRun: boolean; render?: typeof renderFirstPage }): Promise<ProcessResult>` — render → scan date → `namer.name` → `cleanName` → rename. Render/backend errors become `skipped` with a reason (never throw out of `processFile`). Empty cleaned output → `no-name`.

> `render` is injectable so the test can avoid pdfjs; default is the real `renderFirstPage`.

- [ ] **Step 1: Write the failing test**

`tests/process.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processFile } from "../src/name.js";
import type { Namer } from "../src/backends/types.js";

const fakeRender = async () => Buffer.from("PNG");

function namerReturning(text: string): Namer {
  return { async name() { return text; } };
}
function namerThrowing(msg: string): Namer {
  return { async name() { throw new Error(msg); } };
}

test("processFile renames using the cleaned model output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const src = join(dir, "Scanned Document.pdf");
  writeFileSync(src, "x");
  const r = await processFile(src, { namer: namerReturning('"2026-01-18 - Samurai Sushi"'), dryRun: false, render: fakeRender });
  assert.equal(r.outcome, "renamed");
  assert.ok(existsSync(join(dir, "2026-01-18 - Samurai Sushi.pdf")));
});

test("processFile reports skipped on backend error (no throw)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const src = join(dir, "Scanned Document.pdf");
  writeFileSync(src, "x");
  const r = await processFile(src, { namer: namerThrowing("ollama: cannot reach"), dryRun: false, render: fakeRender });
  assert.equal(r.outcome, "skipped");
  assert.match(r.reason ?? "", /ollama/);
  assert.ok(existsSync(src), "file must be left unrenamed");
});

test("processFile reports no-name on empty model output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const src = join(dir, "Scanned Document.pdf");
  writeFileSync(src, "x");
  const r = await processFile(src, { namer: namerReturning("   "), dryRun: false, render: fakeRender });
  assert.equal(r.outcome, "no-name");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `processFile` not exported.

- [ ] **Step 3: Add the implementation to `src/name.ts`**

Append to `src/name.ts` (keep `cleanName` above):
```ts
import { renderFirstPage } from "./render.js";
import { getScanDate } from "./config.js";
import { renameInPlace } from "./rename.js";
import type { Namer } from "./backends/types.js";

export type FileOutcome = "renamed" | "unchanged" | "skipped" | "no-name";

export interface ProcessResult {
  file: string;
  outcome: FileOutcome;
  to?: string;
  reason?: string;
}

export interface ProcessDeps {
  namer: Namer;
  dryRun: boolean;
  render?: typeof renderFirstPage;
}

export async function processFile(pdfPath: string, deps: ProcessDeps): Promise<ProcessResult> {
  const render = deps.render ?? renderFirstPage;
  let png: Buffer;
  try {
    png = await render(pdfPath);
  } catch (e: unknown) {
    return { file: pdfPath, outcome: "skipped", reason: `render failed: ${(e as Error).message}` };
  }
  const scanDate = getScanDate(pdfPath);
  let raw: string;
  try {
    raw = await deps.namer.name(png, scanDate);
  } catch (e: unknown) {
    return { file: pdfPath, outcome: "skipped", reason: (e as Error).message };
  }
  const stem = cleanName(raw);
  if (!stem) {
    return { file: pdfPath, outcome: "no-name" };
  }
  const r = renameInPlace(pdfPath, stem, { dryRun: deps.dryRun });
  return { file: pdfPath, outcome: r.renamed ? "renamed" : "unchanged", to: r.to };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/name.ts tests/process.test.ts
git commit -m "feat: per-file orchestration (render -> name -> rename) with error outcomes"
```

---

## Task 9: Backend factory (`backends/factory.ts`)

**Files:**
- Create: `src/backends/factory.ts`
- Test: `tests/factory.test.ts`

**Interfaces:**
- Consumes: `Config`/`DEFAULT_MODELS` (Task 3), `OllamaNamer` (Task 5), `AnthropicNamer` (Task 6).
- Produces: `function createNamer(config: Config): Namer` — returns `OllamaNamer` or `AnthropicNamer` per `config.backend`. Uses `config.model` if set, else `DEFAULT_MODELS[backend]`. For anthropic, throws if `ANTHROPIC_API_KEY` is missing (fail fast before processing files).

- [ ] **Step 1: Write the failing test**

`tests/factory.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNamer } from "../src/backends/factory.js";
import { OllamaNamer } from "../src/backends/ollama.js";
import { AnthropicNamer } from "../src/backends/anthropic.js";
import { DEFAULT_CONFIG } from "../src/config.js";

test("createNamer returns an Ollama backend by default", () => {
  const n = createNamer({ ...DEFAULT_CONFIG, backend: "ollama" });
  assert.ok(n instanceof OllamaNamer);
});

test("createNamer returns an Anthropic backend when configured (key present)", () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const n = createNamer({ ...DEFAULT_CONFIG, backend: "anthropic", model: "" });
  assert.ok(n instanceof AnthropicNamer);
  delete process.env.ANTHROPIC_API_KEY;
});

test("createNamer throws for anthropic without a key", () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.throws(() => createNamer({ ...DEFAULT_CONFIG, backend: "anthropic" }), /ANTHROPIC_API_KEY/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/backends/factory.js` not found.

- [ ] **Step 3: Write the implementation**

`src/backends/factory.ts`:
```ts
import type { Namer } from "./types.js";
import { OllamaNamer } from "./ollama.js";
import { AnthropicNamer } from "./anthropic.js";
import { DEFAULT_MODELS, type Config } from "../config.js";

export function createNamer(config: Config): Namer {
  const model = config.model || DEFAULT_MODELS[config.backend];
  if (config.backend === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("anthropic backend selected but ANTHROPIC_API_KEY is not set");
    }
    return new AnthropicNamer({ model });
  }
  return new OllamaNamer({ host: config.ollama_host, model });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backends/factory.ts tests/factory.test.ts
git commit -m "feat: backend factory with per-backend default model and key check"
```

---

## Task 10: Notification helper + CLI (`notify.ts`, `index.ts`)

**Files:**
- Create: `src/notify.ts`, `src/index.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `loadConfig`/`initConfig`/`expandHome` (Task 3), `createNamer` (Task 9), `processFile` (Task 8), `notifyOnce` (this task).
- Produces:
  - `notify.ts`: `function notifyOnce(message: string): void` — fires a macOS desktop notification via `osascript`, at most once per process (module-level guard). No-op off macOS.
  - `index.ts`: `async function run(argv: string[]): Promise<{ renamed: number; unchanged: number; skipped: number }>` — parse args, dispatch, process inputs, print per-file lines + a summary, notify once if anything was skipped. Plus a bare `run(process.argv.slice(2))` call at module bottom (the bin entry).

- [ ] **Step 1: Write the failing test** (test `run` for `--init` and a dry-run over a temp dir, with the backend stubbed via a fake Ollama server is overkill — instead test arg dispatch through the real pipeline using a dir of fixtures and the ollama backend pointed at a fake host, asserting it *skips* gracefully)

`tests/cli.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "..", "tests", "fixtures", "sample-receipt.pdf");

test("run --init creates a config file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const cfg = join(dir, "config.json");
  await run(["--init", "-c", cfg]);
  assert.ok(existsSync(cfg));
});

test("run skips gracefully when the ollama backend is unreachable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  const cfg = join(dir, "config.json");
  // backend ollama pointed at a dead port -> processFile returns skipped
  writeFileSync(cfg, JSON.stringify({ backend: "ollama", ollama_host: "http://127.0.0.1:1" }));
  const pdf = join(dir, "Scanned Document.pdf");
  copyFileSync(fixture, pdf);
  const summary = await run(["-c", cfg, pdf]);
  assert.equal(summary.renamed, 0);
  assert.equal(summary.skipped, 1);
  assert.ok(existsSync(pdf), "file left unrenamed on skip");
});
```

> The second test makes a real (failing) fetch to a dead port — fast and hermetic (connection refused). It exercises the full CLI → factory → processFile → render → backend-error path.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/index.js` not found.

- [ ] **Step 3: Write `src/notify.ts`**

```ts
import { execFile } from "node:child_process";
import { platform } from "node:os";

let fired = false;

/** Fire one macOS desktop notification per process. No-op on non-macOS. */
export function notifyOnce(message: string): void {
  if (fired || platform() !== "darwin") return;
  fired = true;
  const script = `display notification ${JSON.stringify(message)} with title "receiptnamer"`;
  execFile("osascript", ["-e", script], () => { /* best-effort, ignore errors */ });
}
```

- [ ] **Step 4: Write `src/index.ts`**

```ts
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { statSync, readdirSync } from "node:fs";
import { loadConfig, initConfig, expandHome } from "./config.js";
import { createNamer } from "./backends/factory.js";
import { processFile, type ProcessResult } from "./name.js";
import { notifyOnce } from "./notify.js";

const USAGE = `receiptnamer — name scanned receipts from their image with a vision model

Usage:
  receiptnamer [--dry-run] <file|dir> ...
  receiptnamer --init                  Create a starter config
  receiptnamer --watch-run             One watcher pass over configured watch_dirs
  receiptnamer --install-watcher       Install the macOS launchd watcher
  receiptnamer --install-quickaction   Install the macOS Finder Quick Action

Options:
  -n, --dry-run        Show what would be renamed without touching files
  -c, --config <path>  Use a specific config file
  -h, --help           Show this help`;

function collectPdfs(input: string): string[] {
  const p = resolve(expandHome(input));
  const st = statSync(p);
  if (st.isDirectory()) {
    return readdirSync(p)
      .filter((f) => f.toLowerCase().endsWith(".pdf") && !f.startsWith("."))
      .map((f) => resolve(p, f));
  }
  return [p];
}

export async function run(argv: string[]): Promise<{ renamed: number; unchanged: number; skipped: number }> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", short: "n", default: false },
      config: { type: "string", short: "c" },
      init: { type: "boolean", default: false },
      "watch-run": { type: "boolean", default: false },
      "install-watcher": { type: "boolean", default: false },
      "install-quickaction": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  const tally = { renamed: 0, unchanged: 0, skipped: 0 };

  if (values.help) { console.log(USAGE); return tally; }
  if (values.init) { initConfig(values.config); return tally; }

  const config = loadConfig(values.config);

  if (values["install-watcher"]) {
    const { installWatcher } = await import("./macos.js");
    installWatcher(values.config);
    return tally;
  }
  if (values["install-quickaction"]) {
    const { installQuickAction } = await import("./macos.js");
    installQuickAction();
    return tally;
  }
  if (values["watch-run"]) {
    const { runWatchPass } = await import("./watch.js");
    const results = await runWatchPass(config, { dryRun: Boolean(values["dry-run"]) });
    return summarize(results, tally);
  }

  if (positionals.length === 0) {
    console.error("error: no files or directories given\n");
    console.error(USAGE);
    process.exitCode = 1;
    return tally;
  }

  let namer;
  try {
    namer = createNamer(config);
  } catch (e: unknown) {
    console.error(`error: ${(e as Error).message}`);
    process.exitCode = 1;
    return tally;
  }

  const files = positionals.flatMap(collectPdfs);
  const results: ProcessResult[] = [];
  for (const f of files) {
    results.push(await processFile(f, { namer, dryRun: Boolean(values["dry-run"]) }));
  }
  return summarize(results, tally);
}

function summarize(
  results: ProcessResult[],
  tally: { renamed: number; unchanged: number; skipped: number }
): { renamed: number; unchanged: number; skipped: number } {
  for (const r of results) {
    if (r.outcome === "renamed") { tally.renamed++; console.log(`RENAMED ${r.file} -> ${r.to}`); }
    else if (r.outcome === "unchanged") { tally.unchanged++; console.log(`UNCHANGED ${r.file}`); }
    else if (r.outcome === "no-name") { tally.skipped++; console.log(`NO NAME ${r.file}`); }
    else { tally.skipped++; console.log(`SKIP ${r.file} (${r.reason ?? "error"})`); }
  }
  console.log(`${tally.renamed} renamed, ${tally.unchanged} unchanged, ${tally.skipped} skipped`);
  if (tally.skipped > 0) notifyOnce(`${tally.skipped} receipt(s) skipped — see terminal output`);
  return tally;
}

run(process.argv.slice(2));
```

> The bottom `run(process.argv.slice(2))` executes on import. In tests we import `{ run }` — that bare call also fires with the test runner's argv, which has no positionals, so it prints usage to stderr and returns harmlessly. That noise is acceptable; alternatively guard it with `if (process.argv[1]?.endsWith("index.js"))`. Implement the guard to keep test output clean:
> ```ts
> import { fileURLToPath } from "node:url";
> if (process.argv[1] === fileURLToPath(import.meta.url)) { run(process.argv.slice(2)); }
> ```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS — `--init` creates the config; the unreachable-ollama run reports `skipped: 1` and leaves the file. (The render of the real fixture runs for real; the backend fetch to `127.0.0.1:1` fails → skip.)

- [ ] **Step 6: Verify the full build now works end-to-end**

Run: `npm run build`
Expected: `dist/index.js` exists, starts with `#!/usr/bin/env node`, mode `755`.
Run: `node dist/index.js --help`
Expected: prints usage.

- [ ] **Step 7: Commit**

```bash
git add src/notify.ts src/index.ts tests/cli.test.ts
git commit -m "feat: CLI entry, dispatch, run summary, and skip notification"
```

---

## Task 11: Folder watcher (`watch.ts`)

**Files:**
- Create: `src/watch.ts`
- Test: `tests/watch.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 3), `createNamer` (Task 9), `processFile` (Task 8), `expandHome` (Task 3).
- Produces:
  - `function isScannedReceipt(filename: string): boolean` — matches `Scanned Document*.pdf` (case-insensitive), excludes dotfiles.
  - `async function runWatchPass(config: Config, opts: { dryRun: boolean }): Promise<ProcessResult[]>` — scan each `watch_dirs` entry once, process matching files. Used by `--watch-run` (launchd).
  - `async function watch(config: Config, opts: { dryRun: boolean }): Promise<void>` — long-running chokidar watcher over `watch_dirs`, processing each matching file on `add`.

> The unit test targets `isScannedReceipt` (pure) and `runWatchPass` (filesystem, no chokidar). The long-running `watch` is exercised manually; do not write a flaky timer-based test for it.

- [ ] **Step 1: Write the failing test**

`tests/watch.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isScannedReceipt, runWatchPass } from "../src/watch.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "..", "tests", "fixtures", "sample-receipt.pdf");

test("isScannedReceipt matches the scanner naming pattern", () => {
  assert.ok(isScannedReceipt("Scanned Document.pdf"));
  assert.ok(isScannedReceipt("Scanned Document 3.pdf"));
  assert.ok(!isScannedReceipt(".Scanned Document.pdf"));
  assert.ok(!isScannedReceipt("2026-01-18 - Foo.pdf"));
  assert.ok(!isScannedReceipt("Scanned Document.txt"));
});

test("runWatchPass processes matching files in watch_dirs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-"));
  copyFileSync(fixture, join(dir, "Scanned Document.pdf"));
  copyFileSync(fixture, join(dir, "already-named.pdf")); // ignored by pattern
  // dead ollama host -> processFile returns skipped, but the *selection* is what we assert
  const results = await runWatchPass(
    { watch_dirs: [dir], backend: "ollama", model: "qwen2.5vl:7b", ollama_host: "http://127.0.0.1:1" },
    { dryRun: false }
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, "skipped");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/watch.js` not found.

- [ ] **Step 3: Write the implementation**

`src/watch.ts`:
```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import chokidar from "chokidar";
import { expandHome, type Config } from "./config.js";
import { createNamer } from "./backends/factory.js";
import { processFile, type ProcessResult } from "./name.js";

export function isScannedReceipt(filename: string): boolean {
  if (filename.startsWith(".")) return false;
  return /^scanned document.*\.pdf$/i.test(filename);
}

export async function runWatchPass(
  config: Config,
  opts: { dryRun: boolean }
): Promise<ProcessResult[]> {
  const namer = createNamer(config);
  const results: ProcessResult[] = [];
  for (const raw of config.watch_dirs) {
    const dir = expandHome(raw);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // missing watch dir — skip silently
    }
    for (const f of entries) {
      if (!isScannedReceipt(f)) continue;
      results.push(await processFile(join(dir, f), { namer, dryRun: opts.dryRun }));
    }
  }
  return results;
}

export async function watch(config: Config, opts: { dryRun: boolean }): Promise<void> {
  const namer = createNamer(config);
  const dirs = config.watch_dirs.map(expandHome);
  const watcher = chokidar.watch(dirs, { ignoreInitial: false, depth: 0, awaitWriteFinish: true });
  watcher.on("add", async (path: string) => {
    const name = path.split("/").pop() ?? "";
    if (!isScannedReceipt(name)) return;
    const r = await processFile(path, { namer, dryRun: opts.dryRun });
    console.log(`${r.outcome.toUpperCase()} ${r.file}${r.to ? ` -> ${r.to}` : ""}`);
  });
  console.log(`Watching: ${dirs.join(", ")}`);
  await new Promise(() => { /* run until killed */ });
}
```

> Add `--watch` dispatch to `src/index.ts` `run()` (after `--watch-run`): a `"watch": { type: "boolean", default: false }` option that calls `const { watch } = await import("./watch.js"); await watch(config, { dryRun: Boolean(values["dry-run"]) });`. Update the test in Task 10 only if you add the flag before Task 11; otherwise add it here and re-run `npm test`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/watch.ts tests/watch.test.ts src/index.ts
git commit -m "feat: scanned-receipt watcher (one-pass + chokidar long-run)"
```

---

## Task 12: macOS installers (`macos.ts`)

**Files:**
- Create: `src/macos.ts`
- Test: `tests/macos.test.ts`

**Interfaces:**
- Consumes: `resolveConfigPath` (Task 3).
- Produces:
  - `function watcherPlist(opts: { nodePath: string; cliPath: string; configPath: string }): string` — returns the launchd plist XML for a periodic `--watch-run` agent.
  - `function installWatcher(configFlag?: string): void` — writes `~/Library/LaunchAgents/com.frankledo.receiptnamer.plist` and `launchctl load`s it.
  - `function quickActionWorkflow(cliPath: string): string` — returns the Automator `document.wflow` XML that runs receiptnamer on selected Finder PDFs.
  - `function installQuickAction(): void` — writes the `.workflow` bundle under `~/Library/Services/`.

> Tests assert the *generated strings* (pure functions) — never invoke `launchctl` or touch `~/Library` in tests.

- [ ] **Step 1: Write the failing test**

`tests/macos.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { watcherPlist, quickActionWorkflow } from "../src/macos.js";

test("watcherPlist embeds node, cli, config and the watch-run arg", () => {
  const xml = watcherPlist({ nodePath: "/usr/bin/node", cliPath: "/x/dist/index.js", configPath: "/c.json" });
  assert.match(xml, /com\.frankledo\.receiptnamer/);
  assert.match(xml, /\/usr\/bin\/node/);
  assert.match(xml, /\/x\/dist\/index\.js/);
  assert.match(xml, /--watch-run/);
  assert.match(xml, /-c<\/string>\s*<string>\/c\.json/s);
  assert.match(xml, /StartInterval|WatchPaths/);
});

test("quickActionWorkflow references the CLI path", () => {
  const xml = quickActionWorkflow("/x/dist/index.js");
  assert.match(xml, /\/x\/dist\/index\.js/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/macos.js` not found.

- [ ] **Step 3: Write the implementation**

`src/macos.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveConfigPath } from "./config.js";

const LABEL = "com.frankledo.receiptnamer";

export function watcherPlist(opts: { nodePath: string; cliPath: string; configPath: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.nodePath}</string>
    <string>${opts.cliPath}</string>
    <string>--watch-run</string>
    <string>-c</string>
    <string>${opts.configPath}</string>
  </array>
  <key>StartInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
}

export function installWatcher(configFlag?: string): void {
  const nodePath = process.execPath;
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const configPath = resolveConfigPath(configFlag);
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, watcherPlist({ nodePath, cliPath, configPath }));
  try { execFileSync("launchctl", ["unload", plistPath]); } catch { /* not loaded yet */ }
  execFileSync("launchctl", ["load", plistPath]);
  console.log(`Installed and loaded launchd watcher: ${plistPath}`);
}

export function quickActionWorkflow(cliPath: string): string {
  const nodePath = process.execPath;
  const script = `for f in "$@"; do "${nodePath}" "${cliPath}" "$f"; done`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key><string>0</string>
  <key>actions</key>
  <array>
    <dict><key>action</key><dict>
      <key>ActionParameters</key><dict>
        <key>COMMAND_STRING</key><string>${script}</string>
        <key>shell</key><string>/bin/zsh</string>
      </dict>
    </dict></dict>
  </array>
</dict>
</plist>
`;
}

export function installQuickAction(): void {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const base = join(homedir(), "Library", "Services", "Rename Receipt.workflow", "Contents");
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, "document.wflow"), quickActionWorkflow(cliPath));
  writeFileSync(
    join(base, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>NSServices</key><array><dict>
    <key>NSMenuItem</key><dict><key>default</key><string>Rename Receipt</string></dict>
    <key>NSMessage</key><string>runWorkflowAsService</string>
    <key>NSSendFileTypes</key><array><string>com.adobe.pdf</string></array>
  </dict></array>
</dict></plist>
`
  );
  console.log(`Installed Finder Quick Action: ${base}`);
}
```

> The Quick Action XML above is minimal. If Automator rejects it on the target macOS, generate the bundle by recording a one-action "Run Shell Script" Quick Action manually and copy its `document.wflow` verbatim into `quickActionWorkflow`. The test only asserts the CLI path is present, so the helper can be refined without breaking tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/macos.ts tests/macos.test.ts
git commit -m "feat: macOS launchd watcher and Finder Quick Action installers"
```

---

## Task 13: Docs, CI workflows, and final verification

**Files:**
- Create: `README.md`, `CHANGELOG.md`
- Create: `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`, `.github/workflows/copilot-rereview.yml`

**Interfaces:**
- Consumes: the finished CLI.
- Produces: user-facing docs and CI. No code.

- [ ] **Step 1: Write `README.md`**

Cover: what it does (names scanned receipts from the image with a vision model), install (`npm install -g @frankledo/receiptnamer`), the two backends (Ollama default — install Ollama + `ollama pull qwen2.5vl:7b`; Anthropic — set `ANTHROPIC_API_KEY`, default model `claude-haiku-4-5`), `--init`, usage examples (single file, directory, `--dry-run`), config schema with the exact keys (`watch_dirs`, `backend`, `model`, `ollama_host`) and a note that the API key is env-only, the macOS watcher + Quick Action, and the iPhone Files-app scan workflow. Note that v2 reads the *image* (no OCR) and why.

- [ ] **Step 2: Write `CHANGELOG.md`**

```markdown
# Changelog

## [Unreleased]
### Added
- Initial Node/TypeScript rewrite: vision-first receipt naming from the rendered
  page image (no OCR), with Ollama (default, qwen2.5vl:7b) and Anthropic
  (claude-haiku-4-5) backends, cross-platform watcher, and macOS installers.
```

- [ ] **Step 3: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    name: Node ${{ matrix.node-version }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22, 24]   # pdfjs-dist@6 requires Node >=22.13.0 || >=24
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 4: Write `.github/workflows/release-please.yml`** (verbatim from pdfnamer)

```yaml
name: Release Please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          release-type: node
  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created }}
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # required for npm Trusted Publishers (OIDC)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'   # pdfjs-dist@6 requires Node >=22.13.0
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish --access public --provenance
```

- [ ] **Step 5: Write `.github/workflows/copilot-rereview.yml`**

Re-request Copilot review on every push once it has reviewed a PR (per the user's house workflow). Use the standard re-review action the user already runs in other repos; if its exact contents aren't to hand, fetch the canonical version from another of the user's repos (e.g. `pdfnamer` is missing it, so copy from a repo that has it, such as the worktrees-isolation repo referenced in memory) and commit it unchanged.

> **House rule (CLAUDE.md):** in the user's own non-fork repos, `copilot-rereview.yml` is normally added as its own dedicated PR. Since this is greenfield scaffolding, including it in the initial repo is fine — but flag to the user that it can be split into a dedicated PR if they prefer.

- [ ] **Step 6: Final full verification**

Run: `npm ci && npm run build && npm test`
Expected: clean install, `dist/index.js` built with shebang + `755`, all tests pass.

Run (optional, requires Ollama + model): `ollama pull qwen2.5vl:7b` then `node dist/index.js --dry-run "tests/fixtures/sample-receipt.pdf"`
Expected: prints a `RENAMED ... -> YYYY-MM-DD - <vendor>.pdf` dry-run line with a well-formed name.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md .github/workflows/
git commit -m "docs: README, changelog, and CI/release/copilot workflows"
```

---

## Self-Review

**Spec coverage:**
- Vision-first pipeline (PDF→PNG→Namer→cleanup→rename) → Tasks 2, 4, 7, 8 ✓
- `Namer` interface, ollama (default, qwen2.5vl:7b) + anthropic (claude-haiku-4-5) → Tasks 5, 6, 9 ✓
- base64 image content block + native fetch, key env-only → Task 6 ✓
- Scan-date fallback → prompt wiring (Task 4) + `getScanDate` (Task 3) + `processFile` (Task 8) ✓
- Skip + one desktop notification per run → Tasks 8 (outcomes), 10 (notify) ✓
- Config shape + `--init` + path precedence + `-c/--config` + `RECEIPTNAMER_CONFIG` → Tasks 3, 10 ✓
- CLI surface (dry-run, init, watch-run, watch, install-watcher, install-quickaction) → Tasks 10, 11, 12 ✓
- Cross-platform watcher (chokidar) + macOS extras → Tasks 11, 12 ✓
- Dependency footprint (pdfjs-dist, @napi-rs/canvas, chokidar; no SDK; no brew) → Task 1 ✓
- Mirror pdfnamer conventions (build/shebang, parseArgs, release-please+OIDC, .npmignore) → Tasks 1, 10, 13 ✓
- Evaluation discipline + TDD with mocked Namer → every backend-dependent test mocks `Namer`/`fetch`; integration uses a real render + dead-port skip ✓
- Migration/coexistence with v1 → Task 1 coexistence note ✓

**Placeholder scan:** No `TODO`/`TBD`/"add error handling" left; every code step has complete code. The only deferred-detail items are (a) the exact `copilot-rereview.yml` contents (Task 13 Step 5 — sourced from the user's existing repo, by house rule) and (b) a possible Quick-Action XML refinement (Task 12 — flagged, test-guarded). Both are explicitly called out, not silent.

**Type consistency:** `Namer.name(imagePng: Buffer, scanDate: string)` is used identically in ollama, anthropic, processFile, and all mocks. `Config` keys (`watch_dirs`, `backend`, `model`, `ollama_host`) are consistent across config.ts, factory.ts, watch.ts, and tests. `ProcessResult.outcome` values (`renamed|unchanged|skipped|no-name`) match between name.ts and index.ts `summarize`. `createNamer(config)` signature consistent in factory.ts, index.ts, watch.ts.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-receiptnamer-v2-node-vision.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
