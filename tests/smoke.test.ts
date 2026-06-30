import { test } from "node:test";
import assert from "node:assert/strict";
import { ok } from "../src/smoke.js";

test("toolchain runs and ESM imports resolve", () => {
  assert.equal(ok(), true);
});
