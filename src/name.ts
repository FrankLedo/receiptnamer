/**
 * Normalize raw model output into a safe filename stem (no extension).
 * Strips square brackets, quotes, and newlines; replaces path separators with
 * '-'; collapses whitespace; drops a trailing .pdf the model may have added.
 */
export function cleanName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[\r\n]+/g, " ");        // newlines -> space
  s = s.replace(/[\[\]"'`]/g, "");        // brackets and quotes
  s = s.replace(/[\/\\]/g, "-");          // path separators -> hyphen
  s = s.replace(/\.pdf$/i, "");           // stray extension
  s = s.replace(/\s+/g, " ").trim();      // collapse + trim
  return s;
}

import { renderFirstPage } from "./render.js";
import { getScanDate } from "./config.js";
import { renameInPlace } from "./rename.js";
import type { Namer } from "./backends/types.js";

export type FileOutcome = "renamed" | "unchanged" | "skipped" | "no-name";

export interface ProcessResult {
  file: string;
  outcome: FileOutcome;
  to?: string;
  reason?: string;
}

export interface ProcessDeps {
  namer: Namer;
  dryRun: boolean;
  render?: typeof renderFirstPage;
}

export async function processFile(pdfPath: string, deps: ProcessDeps): Promise<ProcessResult> {
  const render = deps.render ?? renderFirstPage;
  let png: Buffer;
  try {
    png = await render(pdfPath);
  } catch (e: unknown) {
    return { file: pdfPath, outcome: "skipped", reason: `render failed: ${(e as Error).message}` };
  }
  const scanDate = getScanDate(pdfPath);
  let raw: string;
  try {
    raw = await deps.namer.name(png, scanDate);
  } catch (e: unknown) {
    return { file: pdfPath, outcome: "skipped", reason: (e as Error).message };
  }
  const stem = cleanName(raw);
  if (!stem) {
    return { file: pdfPath, outcome: "no-name" };
  }
  const r = renameInPlace(pdfPath, stem, { dryRun: deps.dryRun });
  return { file: pdfPath, outcome: r.renamed ? "renamed" : "unchanged", to: r.to };
}
