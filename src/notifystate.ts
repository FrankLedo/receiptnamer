import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export function skipStatePath(): string {
  return join(homedir(), ".config", "receiptnamer", ".skip-state.json");
}

/**
 * Given the files skipped in THIS watcher pass, return only those not skipped in
 * the previous pass, and persist the current set as the new state. Used to avoid
 * re-notifying every 30s about the same perpetually-failing receipt. Best-effort:
 * an unreadable state file is treated as empty; a failed write is ignored.
 */
export function filterNewSkips(skippedFiles: string[], stateFile: string = skipStatePath()): string[] {
  let previous: string[] = [];
  try {
    previous = JSON.parse(readFileSync(stateFile, "utf8")) as string[];
    if (!Array.isArray(previous)) previous = [];
  } catch {
    previous = [];
  }
  const prevSet = new Set(previous);
  const fresh = skippedFiles.filter((f) => !prevSet.has(f));
  try {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(skippedFiles));
  } catch {
    /* best-effort */
  }
  return fresh;
}
