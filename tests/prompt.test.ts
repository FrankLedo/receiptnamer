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
