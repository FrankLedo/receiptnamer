import { readdirSync } from "node:fs";
import { join } from "node:path";
import chokidar from "chokidar";
import { expandHome, type Config } from "./config.js";
import { createNamer } from "./backends/factory.js";
import { processFile, type ProcessResult } from "./name.js";

export function isScannedReceipt(filename: string): boolean {
  if (filename.startsWith(".")) return false;
  return /^scanned document.*\.pdf$/i.test(filename);
}

export async function runWatchPass(
  config: Config,
  opts: { dryRun: boolean }
): Promise<ProcessResult[]> {
  const namer = createNamer(config);
  const results: ProcessResult[] = [];
  for (const raw of config.watch_dirs) {
    const dir = expandHome(raw);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // missing watch dir — skip silently
    }
    for (const f of entries) {
      if (!isScannedReceipt(f)) continue;
      results.push(await processFile(join(dir, f), { namer, dryRun: opts.dryRun }));
    }
  }
  return results;
}

export async function watch(config: Config, opts: { dryRun: boolean }): Promise<void> {
  const namer = createNamer(config);
  const dirs = config.watch_dirs.map(expandHome);
  const watcher = chokidar.watch(dirs, { ignoreInitial: false, depth: 0, awaitWriteFinish: true });
  watcher.on("add", async (path: string) => {
    const name = path.split("/").pop() ?? "";
    if (!isScannedReceipt(name)) return;
    const r = await processFile(path, { namer, dryRun: opts.dryRun });
    console.log(`${r.outcome.toUpperCase()} ${r.file}${r.to ? ` -> ${r.to}` : ""}`);
  });
  console.log(`Watching: ${dirs.join(", ")}`);
  await new Promise(() => { /* run until killed */ });
}
