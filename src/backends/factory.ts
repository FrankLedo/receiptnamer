import type { Namer } from "./types.js";
import { OllamaNamer } from "./ollama.js";
import { AnthropicNamer } from "./anthropic.js";
import { DEFAULT_MODELS, type Config } from "../config.js";

export function createNamer(config: Config): Namer {
  const model = config.model || DEFAULT_MODELS[config.backend];
  if (config.backend === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("anthropic backend selected but ANTHROPIC_API_KEY is not set");
    }
    return new AnthropicNamer({ model });
  }
  return new OllamaNamer({ host: config.ollama_host, model });
}
