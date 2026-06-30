import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaNamer } from "../src/backends/ollama.js";

function fakeFetch(captured: { body?: any; url?: string }, response: any, okFlag = true): typeof fetch {
  return (async (url: any, init: any) => {
    captured.url = String(url);
    captured.body = JSON.parse(init.body);
    return {
      ok: okFlag,
      status: okFlag ? 200 : 500,
      async json() { return response; },
      async text() { return JSON.stringify(response); },
    };
  }) as unknown as typeof fetch;
}

test("OllamaNamer posts the image+prompt and returns the response", async () => {
  const captured: any = {};
  const namer = new OllamaNamer({
    host: "http://localhost:11434",
    model: "qwen2.5vl:7b",
    fetchImpl: fakeFetch(captured, { response: " 2026-01-18 - Samurai Sushi \n" }),
  });
  const out = await namer.name(Buffer.from("PNGDATA"), "2026-01-18");
  assert.equal(out, "2026-01-18 - Samurai Sushi");
  assert.equal(captured.url, "http://localhost:11434/api/generate");
  assert.equal(captured.body.model, "qwen2.5vl:7b");
  assert.equal(captured.body.stream, false);
  assert.equal(captured.body.options.temperature, 0);
  assert.equal(captured.body.images[0], Buffer.from("PNGDATA").toString("base64"));
  assert.match(captured.body.prompt, /2026-01-18/);
});

test("OllamaNamer throws on a non-OK response", async () => {
  const captured: any = {};
  const namer = new OllamaNamer({
    host: "http://localhost:11434",
    model: "qwen2.5vl:7b",
    fetchImpl: fakeFetch(captured, { error: "boom" }, false),
  });
  await assert.rejects(() => namer.name(Buffer.from("x"), "2026-01-01"), /ollama/i);
});
