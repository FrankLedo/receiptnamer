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
