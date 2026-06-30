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
