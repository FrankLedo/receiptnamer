import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterNewSkips } from "../src/notifystate.js";

test("filterNewSkips only returns newly-skipped files across calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-state-"));
  const sf = join(dir, ".skip-state.json");

  assert.deepEqual(filterNewSkips(["/a", "/b"], sf), ["/a", "/b"]);
  assert.deepEqual(filterNewSkips(["/a", "/b"], sf), []);
  assert.deepEqual(filterNewSkips(["/a", "/c"], sf), ["/c"]);
  assert.deepEqual(filterNewSkips([], sf), []);
});

test("filterNewSkips treats a missing state file as empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "rn-state-"));
  const sf = join(dir, "nested", ".skip-state.json");

  assert.deepEqual(filterNewSkips(["/x", "/y"], sf), ["/x", "/y"]);
});
