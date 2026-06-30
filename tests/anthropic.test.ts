import { test } from "node:test";
import assert from "node:assert/strict";
import { AnthropicNamer } from "../src/backends/anthropic.js";

function fakeFetch(captured: any, response: any, okFlag = true): typeof fetch {
  return (async (url: any, init: any) => {
    captured.url = String(url);
    captured.headers = init.headers;
    captured.body = JSON.parse(init.body);
    return {
      ok: okFlag,
      status: okFlag ? 200 : 400,
      async json() { return response; },
      async text() { return JSON.stringify(response); },
    };
  }) as unknown as typeof fetch;
}

test("AnthropicNamer sends an image block + text and returns the text", async () => {
  const captured: any = {};
  const namer = new AnthropicNamer({
    model: "claude-haiku-4-5",
    apiKey: "sk-test",
    fetchImpl: fakeFetch(captured, { content: [{ type: "text", text: " 2026-01-18 - Samurai Sushi " }] }),
  });
  const out = await namer.name(Buffer.from("PNGDATA"), "2026-01-18");
  assert.equal(out, "2026-01-18 - Samurai Sushi");
  assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
  assert.equal(captured.headers["x-api-key"], "sk-test");
  assert.equal(captured.headers["anthropic-version"], "2023-06-01");
  assert.equal(captured.body.model, "claude-haiku-4-5");
  assert.equal(captured.body.temperature, 0);
  const content = captured.body.messages[0].content;
  assert.equal(content[0].type, "image");
  assert.equal(content[0].source.type, "base64");
  assert.equal(content[0].source.media_type, "image/png");
  assert.equal(content[0].source.data, Buffer.from("PNGDATA").toString("base64"));
  assert.equal(content[1].type, "text");
  assert.match(content[1].text, /2026-01-18/);
});

test("AnthropicNamer throws when the API key is missing", async () => {
  const namer = new AnthropicNamer({ model: "claude-haiku-4-5", apiKey: "" });
  await assert.rejects(() => namer.name(Buffer.from("x"), "2026-01-01"), /ANTHROPIC_API_KEY/);
});

test("AnthropicNamer throws on a non-OK response", async () => {
  const captured: any = {};
  const namer = new AnthropicNamer({
    model: "claude-haiku-4-5",
    apiKey: "sk-test",
    fetchImpl: fakeFetch(captured, { error: { message: "bad" } }, false),
  });
  await assert.rejects(() => namer.name(Buffer.from("x"), "2026-01-01"), /anthropic/i);
});
