import { existsSync, renameSync } from "node:fs";
import { dirname, extname, join, basename } from "node:path";

export function uniqueTarget(dir: string, stem: string, ext: string): string {
  let candidate = join(dir, `${stem}${ext}`);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (${n})${ext}`);
    n++;
  }
  return candidate;
}

export function renameInPlace(
  srcPath: string,
  stem: string,
  opts: { dryRun: boolean }
): { from: string; to: string; renamed: boolean } {
  const dir = dirname(srcPath);
  const ext = extname(srcPath) || ".pdf";
  const currentStem = basename(srcPath, ext);
  if (currentStem === stem) {
    return { from: srcPath, to: srcPath, renamed: false };
  }
  const to = uniqueTarget(dir, stem, ext);
  if (!opts.dryRun) {
    renameSync(srcPath, to);
  }
  return { from: srcPath, to, renamed: true };
}
