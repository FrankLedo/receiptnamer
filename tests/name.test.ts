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
