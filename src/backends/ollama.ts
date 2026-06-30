import type { Namer } from "./types.js";
import { buildPrompt } from "../prompt.js";

export interface OllamaOptions {
  host: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OllamaNamer implements Namer {
  private readonly host: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaOptions) {
    this.host = opts.host.replace(/\/$/, "");
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async name(imagePng: Buffer, scanDate: string): Promise<string> {
    const url = `${this.host}/api/generate`;
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: buildPrompt(scanDate),
          images: [imagePng.toString("base64")],
          stream: false,
          options: { temperature: 0 },
        }),
      });
    } catch (e: unknown) {
      throw new Error(`ollama: cannot reach ${url} — ${(e as Error).message}`);
    }
    if (!res.ok) {
      throw new Error(`ollama: HTTP ${res.status} from ${url}`);
    }
    const data = (await res.json()) as { response?: string };
    return (data.response ?? "").trim();
  }
}
