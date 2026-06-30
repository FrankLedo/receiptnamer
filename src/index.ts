import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { statSync, readdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, initConfig, expandHome } from "./config.js";
import { createNamer } from "./backends/factory.js";
import { processFile, type ProcessResult } from "./name.js";
import { notifyOnce } from "./notify.js";

const USAGE = `receiptnamer — name scanned receipts from their image with a vision model

Usage:
  receiptnamer [--dry-run] <file|dir> ...
  receiptnamer --init                  Create a starter config
  receiptnamer --watch-run             One watcher pass over configured watch_dirs
  receiptnamer --watch                 Run a continuous watcher
  receiptnamer --install-watcher       Install the macOS launchd watcher
  receiptnamer --install-quickaction   Install the macOS Finder Quick Action

Options:
  -n, --dry-run        Show what would be renamed without touching files
  -c, --config <path>  Use a specific config file
  -h, --help           Show this help`;

function collectPdfs(input: string): string[] {
  const p = resolve(expandHome(input));
  let st;
  try {
    st = statSync(p);
  } catch {
    console.log(`SKIP ${p} (not found)`);
    return [];
  }
  if (st.isDirectory()) {
    return readdirSync(p)
      .filter((f) => f.toLowerCase().endsWith(".pdf") && !f.startsWith("."))
      .map((f) => resolve(p, f));
  }
  return [p];
}

export async function run(argv: string[]): Promise<{ renamed: number; unchanged: number; skipped: number }> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", short: "n", default: false },
      config: { type: "string", short: "c" },
      init: { type: "boolean", default: false },
      "watch-run": { type: "boolean", default: false },
      watch: { type: "boolean", default: false },
      "install-watcher": { type: "boolean", default: false },
      "install-quickaction": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  const tally = { renamed: 0, unchanged: 0, skipped: 0 };

  if (values.help) { console.log(USAGE); return tally; }
  if (values.init) { initConfig(values.config); return tally; }

  const config = loadConfig(values.config);

  if (values["install-watcher"]) {
    const { installWatcher } = await import("./macos.js");
    installWatcher(values.config);
    return tally;
  }
  if (values["install-quickaction"]) {
    const { installQuickAction } = await import("./macos.js");
    installQuickAction();
    return tally;
  }
  if (values["watch-run"]) {
    const { runWatchPass } = await import("./watch.js");
    try {
      const results = await runWatchPass(config, { dryRun: Boolean(values["dry-run"]) });
      return summarize(results, tally);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`error: ${msg}`);
      notifyOnce(`receiptnamer watcher error: ${msg}`);
      return tally;
    }
  }
  if (values["watch"]) {
    const { watch } = await import("./watch.js");
    try {
      await watch(config, { dryRun: Boolean(values["dry-run"]) });
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`error: ${msg}`);
      notifyOnce(`receiptnamer watcher error: ${msg}`);
    }
    return tally;
  }

  if (positionals.length === 0) {
    console.error("error: no files or directories given\n");
    console.error(USAGE);
    process.exitCode = 1;
    return tally;
  }

  let namer;
  try {
    namer = createNamer(config);
  } catch (e: unknown) {
    console.error(`error: ${(e as Error).message}`);
    process.exitCode = 1;
    return tally;
  }

  const files = positionals.flatMap(collectPdfs);
  const results: ProcessResult[] = [];
  for (const f of files) {
    results.push(await processFile(f, { namer, dryRun: Boolean(values["dry-run"]) }));
  }
  return summarize(results, tally);
}

function summarize(
  results: ProcessResult[],
  tally: { renamed: number; unchanged: number; skipped: number }
): { renamed: number; unchanged: number; skipped: number } {
  for (const r of results) {
    if (r.outcome === "renamed") { tally.renamed++; console.log(`RENAMED ${r.file} -> ${r.to}`); }
    else if (r.outcome === "unchanged") { tally.unchanged++; console.log(`UNCHANGED ${r.file}`); }
    else if (r.outcome === "no-name") { tally.skipped++; console.log(`NO NAME ${r.file}`); }
    else { tally.skipped++; console.log(`SKIP ${r.file} (${r.reason ?? "error"})`); }
  }
  console.log(`${tally.renamed} renamed, ${tally.unchanged} unchanged, ${tally.skipped} skipped`);
  if (tally.skipped > 0) notifyOnce(`${tally.skipped} receipt(s) skipped — see terminal output`);
  return tally;
}

const invokedAsBin =
  !!process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedAsBin) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
