import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveConfigPath } from "./config.js";

const LABEL = "com.frankledo.receiptnamer";

export function watcherPlist(opts: { nodePath: string; cliPath: string; configPath: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.nodePath}</string>
    <string>${opts.cliPath}</string>
    <string>--watch-run</string>
    <string>-c</string>
    <string>${opts.configPath}</string>
  </array>
  <key>StartInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
}

export function installWatcher(configFlag?: string): void {
  const nodePath = process.execPath;
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const configPath = resolveConfigPath(configFlag);
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, watcherPlist({ nodePath, cliPath, configPath }));
  try { execFileSync("launchctl", ["unload", plistPath]); } catch { /* not loaded yet */ }
  execFileSync("launchctl", ["load", plistPath]);
  console.log(`Installed and loaded launchd watcher: ${plistPath}`);
}

export function quickActionWorkflow(cliPath: string): string {
  const nodePath = process.execPath;
  const script = `for f in "$@"; do "${nodePath}" "${cliPath}" "$f"; done`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key><string>0</string>
  <key>actions</key>
  <array>
    <dict><key>action</key><dict>
      <key>ActionParameters</key><dict>
        <key>COMMAND_STRING</key><string>${script}</string>
        <key>shell</key><string>/bin/zsh</string>
      </dict>
    </dict></dict>
  </array>
</dict>
</plist>
`;
}

export function installQuickAction(): void {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const base = join(homedir(), "Library", "Services", "Rename Receipt.workflow", "Contents");
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, "document.wflow"), quickActionWorkflow(cliPath));
  writeFileSync(
    join(base, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>NSServices</key><array><dict>
    <key>NSMenuItem</key><dict><key>default</key><string>Rename Receipt</string></dict>
    <key>NSMessage</key><string>runWorkflowAsService</string>
    <key>NSSendFileTypes</key><array><string>com.adobe.pdf</string></array>
  </dict></array>
</dict></plist>
`
  );
  console.log(`Installed Finder Quick Action: ${base}`);
}
