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
