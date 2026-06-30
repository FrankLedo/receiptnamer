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
