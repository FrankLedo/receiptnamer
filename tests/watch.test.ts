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
