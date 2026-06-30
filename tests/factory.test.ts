import { test } from "node:test";
import assert from "node:assert/strict";
import { createNamer } from "../src/backends/factory.js";
import { OllamaNamer } from "../src/backends/ollama.js";
import { AnthropicNamer } from "../src/backends/anthropic.js";
import { DEFAULT_CONFIG } from "../src/config.js";

test("createNamer returns an Ollama backend by default", () => {
  const n = createNamer({ ...DEFAULT_CONFIG, backend: "ollama" });
  assert.ok(n instanceof OllamaNamer);
});

test("createNamer returns an Anthropic backend when configured (key present)", () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const n = createNamer({ ...DEFAULT_CONFIG, backend: "anthropic", model: "" });
  assert.ok(n instanceof AnthropicNamer);
  delete process.env.ANTHROPIC_API_KEY;
});

test("createNamer throws for anthropic without a key", () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.throws(() => createNamer({ ...DEFAULT_CONFIG, backend: "anthropic" }), /ANTHROPIC_API_KEY/);
});
