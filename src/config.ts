import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type Backend = "ollama" | "anthropic";

export interface Config {
  watch_dirs: string[];
  backend: Backend;
  model: string;
  ollama_host: string;
}

export const DEFAULT_CONFIG: Config = {
  watch_dirs: [],
  backend: "ollama",
  model: "qwen2.5vl:7b",
  ollama_host: "http://localhost:11434",
};

// Default model per backend (used when --init writes a starter file or when a
// user switches backend without setting model). DEFAULT_CONFIG.model is the
// ollama default; anthropic's default is applied in the anthropic backend.
export const DEFAULT_MODELS: Record<Backend, string> = {
  ollama: "qwen2.5vl:7b",
  anthropic: "claude-haiku-4-5",
};

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return homedir() + p.slice(1);
  return p;
}

export function getDefaultConfigPath(): string {
  return join(homedir(), ".config", "receiptnamer", "config.json");
}

export function resolveConfigPath(flag?: string): string {
  if (flag) return expandHome(flag);
  if (process.env.RECEIPTNAMER_CONFIG) return expandHome(process.env.RECEIPTNAMER_CONFIG);
  return getDefaultConfigPath();
}

export function loadConfig(flag?: string): Config {
  const p = resolveConfigPath(flag);
  if (!existsSync(p)) {
    console.warn(`No config at ${p} — run 'receiptnamer --init' to create one. Using defaults.`);
    return DEFAULT_CONFIG;
  }
  try {
    const user = JSON.parse(readFileSync(p, "utf8")) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...user };
  } catch (e: unknown) {
    console.error(`Config parse error: ${(e as Error).message}. Using defaults.`);
    return DEFAULT_CONFIG;
  }
}

export function initConfig(flag?: string): void {
  const p = resolveConfigPath(flag);
  if (existsSync(p)) {
    console.log(`Config already exists at ${p}`);
    return;
  }
  // Pre-fill the common iCloud "Receipts and Manuals" path if it exists.
  const guess = join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Receipts and Manuals");
  const sample: Config = {
    ...DEFAULT_CONFIG,
    watch_dirs: existsSync(guess) ? [guess] : ["~/Documents/Receipts"],
  };
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(sample, null, 2) + "\n");
  console.log(`Created sample config at ${p}`);
}

/** File creation date (birthtime, falling back to mtime) as YYYY-MM-DD, local time. */
export function getScanDate(filePath: string): string {
  const st = statSync(filePath);
  const d = st.birthtime.getTime() ? st.birthtime : st.mtime;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
