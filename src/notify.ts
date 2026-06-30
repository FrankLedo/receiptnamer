import { execFile } from "node:child_process";
import { platform } from "node:os";

let fired = false;

/** Fire one macOS desktop notification per process. No-op on non-macOS. */
export function notifyOnce(message: string): void {
  if (fired || platform() !== "darwin") return;
  fired = true;
  const script = `display notification ${JSON.stringify(message)} with title "receiptnamer"`;
  execFile("osascript", ["-e", script], () => { /* best-effort, ignore errors */ });
}
