import { test } from "node:test";
import assert from "node:assert/strict";
import { watcherPlist, quickActionWorkflow, stableNodePath } from "../src/macos.js";

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

// A brew upgrade deletes Cellar/<version>/, so a baked execPath is a time bomb.
// opt/node/ is the stable indirection that survives version bumps.
test("stableNodePath rewrites a Cellar path to the opt symlink", () => {
  const exists = (p: string) => p === "/opt/homebrew/opt/node/bin/node";
  assert.equal(
    stableNodePath("/opt/homebrew/Cellar/node/26.5.0/bin/node", exists),
    "/opt/homebrew/opt/node/bin/node",
  );
  assert.equal(
    stableNodePath("/usr/local/Cellar/node/24.1.0/bin/node", (p: string) => p === "/usr/local/opt/node/bin/node"),
    "/usr/local/opt/node/bin/node",
  );
});

test("stableNodePath keeps the original when no stable alias exists", () => {
  const never = () => false;
  assert.equal(stableNodePath("/opt/homebrew/Cellar/node/26.5.0/bin/node", never), "/opt/homebrew/Cellar/node/26.5.0/bin/node");
  const nvm = "/Users/x/.nvm/versions/node/v22.19.0/bin/node";
  assert.equal(stableNodePath(nvm, () => true), nvm);
});

test("watcherPlist is given a de-versioned node path by stableNodePath", () => {
  const node = stableNodePath("/opt/homebrew/Cellar/node/26.5.0/bin/node", (p: string) => p === "/opt/homebrew/opt/node/bin/node");
  const xml = watcherPlist({ nodePath: node, cliPath: "/x/dist/index.js", configPath: "/c.json" });
  assert.doesNotMatch(xml, /Cellar/);
});

// Quick Actions run a non-interactive zsh with PATH=/bin:/usr/bin:/usr/ucb:/usr/local/bin.
// ~/.zshrc is never sourced, so neither `node` nor `receiptnamer` resolve by name.
test("quickActionWorkflow never relies on PATH lookup for node", () => {
  const xml = quickActionWorkflow("/x/dist/index.js", "/opt/homebrew/opt/node/bin/node");
  assert.doesNotMatch(xml, /env node/);
  // every node invocation is through an absolute path held in a variable
  assert.match(xml, /"\$node_bin"/);
});

test("quickActionWorkflow probes candidates and prefers the supplied node", () => {
  const xml = quickActionWorkflow("/x/dist/index.js", "/opt/homebrew/opt/node/bin/node");
  assert.match(xml, /\/opt\/homebrew\/opt\/node\/bin\/node/);
  assert.match(xml, /\/usr\/local\/opt\/node\/bin\/node/);
  assert.match(xml, /\.nvm\/versions\/node/);
});

// Silent failure is why the last breakage went unnoticed: Automator discards stderr.
test("quickActionWorkflow notifies instead of failing silently", () => {
  const xml = quickActionWorkflow("/x/dist/index.js", "/opt/homebrew/opt/node/bin/node");
  assert.match(xml, /display notification/);
  assert.match(xml, /--install-quickaction/); // tells you how to repair it
});

// `2>&1` inside a plist <string> must be escaped or the XML is malformed
// and Automator silently refuses to load the workflow.
test("quickActionWorkflow XML-escapes the shell script", () => {
  const xml = quickActionWorkflow("/x/dist/index.js", "/opt/homebrew/opt/node/bin/node");
  assert.match(xml, /2&gt;&amp;1/);
  assert.doesNotMatch(xml, /2>&1/);
});

test("quickActionWorkflow carries the Automator metadata the action needs to load", () => {
  const xml = quickActionWorkflow("/x/dist/index.js", "/opt/homebrew/opt/node/bin/node");
  assert.match(xml, /Run Shell Script\.action/);
  assert.match(xml, /com\.apple\.RunShellScript/);
  assert.match(xml, /com\.apple\.Automator\.fileSystemObject/);
  assert.match(xml, /<key>inputMethod<\/key>\s*<integer>1<\/integer>/);
});
