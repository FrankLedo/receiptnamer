import type { Namer } from "./types.js";
import { buildPrompt } from "../prompt.js";

export interface AnthropicOptions {
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

export class AnthropicNamer implements Namer {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async name(imagePng: Buffer, scanDate: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("anthropic: ANTHROPIC_API_KEY is not set");
    }
    const url = "https://api.anthropic.com/v1/messages";
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 64,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: imagePng.toString("base64") },
                },
                { type: "text", text: buildPrompt(scanDate) },
              ],
            },
          ],
        }),
      });
    } catch (e: unknown) {
      throw new Error(`anthropic: request failed — ${(e as Error).message}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`anthropic: HTTP ${res.status} ${detail}`);
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    return text.trim();
  }
}
