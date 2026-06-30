export function buildPrompt(scanDate: string): string {
  return `You name scanned receipt files from the image. Output ONLY the filename: no extension, no path, no quotes, no explanation, no square brackets.

Format: YYYY-MM-DD - Vendor
You may append ' - short context' only when clearly useful (e.g. ' - dinner').

Rules:
- Read the transaction date FROM the receipt and use it. If there is truly no transaction date on the document (e.g. a product manual), use ${scanDate} as the date — never guess a date.
- Use the real merchant/vendor name in Title Case with normal spaces. Never use ALL CAPS, underscores, or square brackets.

Example of a correct answer: 2026-01-18 - Samurai Sushi - dinner`;
}
