import { test } from "node:test";
import assert from "node:assert/strict";
import { watcherPlist, quickActionWorkflow } from "../src/macos.js";

test("watcherPlist embeds node, cli, config and the watch-run arg", () => {
  const xml = watcherPlist({ nodePath: "/usr/bin/node", cliPath: "/x/dist/index.js", configPath: "/c.json" });
  assert.match(xml, /com\.frankledo\.receiptnamer/);
  assert.match(xml, /\/usr\/bin\/node/);
  assert.match(xml, /\/x\/dist\/index\.js/);
  assert.match(xml, /--watch-run/);
  assert.match(xml, /-c<\/string>\s*<string>\/c\.json/s);
  assert.match(xml, /StartInterval|WatchPaths/);
});

test("quickActionWorkflow references the CLI path", () => {
  const xml = quickActionWorkflow("/x/dist/index.js");
  assert.match(xml, /\/x\/dist\/index\.js/);
});
