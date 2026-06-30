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
