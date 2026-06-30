import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs-dist needs a worker even in Node; point it at the bundled legacy worker.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

/**
 * Render page 1 of a PDF to a PNG buffer, scaled so the longest edge is `maxEdge`
 * pixels. iPhone scans have large native page dimensions, so a fixed DPI yields
 * unpredictably huge images; a long-edge budget keeps cost bounded (Anthropic
 * downscales to <=1568px anyway, and Ollama stays fast) while preserving detail.
 */
export async function renderFirstPage(pdfPath: string, maxEdge = 2048): Promise<Buffer> {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = maxEdge / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const context = canvas.getContext("2d");
  // pdfjs v6 in Node: pass canvasContext, viewport, and the canvas itself.
  await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  return canvas.toBuffer("image/png");
}
