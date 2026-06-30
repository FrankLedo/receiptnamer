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
