import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveConfigPath } from "./config.js";

const LABEL = "com.frankledo.receiptnamer";

/** Directory name of the installed Quick Action. Legacy names are removed on install. */
const QUICK_ACTION_NAME = "receiptnamer.workflow";
const LEGACY_QUICK_ACTION_NAMES = ["Rename Receipt.workflow"];

/**
 * Homebrew installs node under Cellar/<version>/ and points bin/node at it, so
 * process.execPath is version-pinned and dies on the next `brew upgrade node`.
 * opt/node/ is the stable alias brew maintains across upgrades — prefer it.
 */
const CELLAR_NODE = /^(\/(?:opt\/homebrew|usr\/local))\/Cellar\/node\/[^/]+\/bin\/node$/;

export function stableNodePath(execPath: string, exists: (p: string) => boolean = existsSync): string {
  const m = CELLAR_NODE.exec(execPath);
  if (m) {
    const alias = `${m[1]}/opt/node/bin/node`;
    if (exists(alias)) return alias;
  }
  return execPath;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function watcherPlist(opts: { nodePath: string; cliPath: string; configPath: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(opts.nodePath)}</string>
    <string>${xmlEscape(opts.cliPath)}</string>
    <string>--watch-run</string>
    <string>-c</string>
    <string>${xmlEscape(opts.configPath)}</string>
  </array>
  <key>StartInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
}

export function installWatcher(configFlag?: string): void {
  const nodePath = stableNodePath(process.execPath);
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const configPath = resolveConfigPath(configFlag);
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, watcherPlist({ nodePath, cliPath, configPath }));
  try { execFileSync("launchctl", ["unload", plistPath]); } catch { /* not loaded yet */ }
  execFileSync("launchctl", ["load", plistPath]);
  console.log(`Installed and loaded launchd watcher: ${plistPath}`);
  console.log(`  node: ${nodePath}`);
}

/**
 * A Quick Action runs a non-interactive zsh whose PATH is
 * /bin:/usr/bin:/usr/ucb:/usr/local/bin — ~/.zshrc is never sourced, so neither
 * `node` nor `receiptnamer` resolve by name and a `#!/usr/bin/env node` shebang
 * cannot fire. Every path here is therefore absolute, resolved at run time
 * against a candidate list so a node upgrade or a move to nvm doesn't strand us.
 */
function quickActionScript(cliPath: string, preferredNode: string): string {
  return `cli=${JSON.stringify(cliPath)}
node_bin=""
for c in ${JSON.stringify(preferredNode)} \\
         /opt/homebrew/opt/node/bin/node /opt/homebrew/bin/node \\
         /usr/local/opt/node/bin/node /usr/local/bin/node /usr/bin/node; do
  if [ -x "$c" ]; then node_bin="$c"; break; fi
done
if [ -z "$node_bin" ]; then
  for c in "$HOME"/.nvm/versions/node/*/bin/node; do
    [ -x "$c" ] && node_bin="$c"
  done
fi

notify() { osascript -e "display notification \\"$1\\" with title \\"receiptnamer\\""; }

if [ -z "$node_bin" ]; then
  notify "Cannot find node. Reinstall with: receiptnamer --install-quickaction"
  exit 1
fi
if [ ! -f "$cli" ]; then
  notify "CLI missing at $cli - reinstall with: receiptnamer --install-quickaction"
  exit 1
fi

summary=$("$node_bin" "$cli" "$@" 2>&1 | tail -1)
notify "\${summary:-done}"
`;
}

export function quickActionWorkflow(cliPath: string, nodePath: string = stableNodePath(process.execPath)): string {
  const script = xmlEscape(quickActionScript(cliPath, nodePath));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key><string>537</string>
	<key>AMApplicationVersion</key><string>2.10</string>
	<key>AMDocumentVersion</key><string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key><string>List</string>
					<key>Optional</key><true/>
					<key>Types</key><array><string>com.apple.cocoa.string</string></array>
				</dict>
				<key>AMActionVersion</key><string>2.0.3</string>
				<key>AMApplication</key><array><string>Automator</string></array>
				<key>AMProvides</key>
				<dict>
					<key>Container</key><string>List</string>
					<key>Types</key><array><string>com.apple.cocoa.string</string></array>
				</dict>
				<key>ActionBundlePath</key><string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key><string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key><string>${script}</string>
					<key>CheckedForUserDefaultShell</key><true/>
					<key>inputMethod</key><integer>1</integer>
					<key>shell</key><string>/bin/zsh</string>
					<key>source</key><string></string>
				</dict>
				<key>BundleIdentifier</key><string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key><string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key><false/>
				<key>CanShowWhenRun</key><true/>
				<key>Category</key><array><string>AMCategoryUtilities</string></array>
				<key>Class Name</key><string>RunShellScriptAction</string>
				<key>InputUUID</key><string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
				<key>OutputUUID</key><string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
				<key>UUID</key><string>C3D4E5F6-A7B8-9012-CDEF-123456789012</string>
				<key>UnlocalizedApplications</key><array><string>Automator</string></array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key><integer>0</integer>
						<key>name</key><string>inputMethod</string>
						<key>required</key><string>0</string>
						<key>type</key><string>0</string>
						<key>uuid</key><string>0</string>
					</dict>
				</dict>
				<key>conversionLabel</key><integer>0</integer>
				<key>isViewVisible</key><integer>1</integer>
			</dict>
			<key>isViewVisible</key><integer>1</integer>
		</dict>
	</array>
	<key>connectors</key><dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>inputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key><string>com.apple.Automator.nothing</string>
		<key>presentationMode</key><integer>15</integer>
		<key>processesInput</key><false/>
		<key>serviceInputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject</string>
		<key>serviceProcessesInput</key><integer>0</integer>
		<key>systemImageName</key><string>NSTouchBarDocuments</string>
		<key>useAutomaticInputType</key><integer>0</integer>
		<key>workflowTypeIdentifier</key><string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
`;
}

export function quickActionInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>NSServices</key><array><dict>
    <key>NSIconName</key><string>NSTouchBarDocuments</string>
    <key>NSMenuItem</key><dict><key>default</key><string>Rename with receiptnamer</string></dict>
    <key>NSMessage</key><string>runWorkflowAsService</string>
    <key>NSSendFileTypes</key><array><string>com.adobe.pdf</string></array>
  </dict></array>
</dict></plist>
`;
}

export function installQuickAction(): void {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const nodePath = stableNodePath(process.execPath);
  const services = join(homedir(), "Library", "Services");

  // Remove earlier names so the Services menu keeps exactly one entry.
  for (const legacy of LEGACY_QUICK_ACTION_NAMES) {
    rmSync(join(services, legacy), { recursive: true, force: true });
  }

  const base = join(services, QUICK_ACTION_NAME, "Contents");
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, "document.wflow"), quickActionWorkflow(cliPath, nodePath));
  writeFileSync(join(base, "Info.plist"), quickActionInfoPlist());

  // The Services menu caches its registry; without a flush a fresh install can
  // take an unpredictable amount of time (or a logout) to appear.
  try { execFileSync("/System/Library/CoreServices/pbs", ["-flush"]); } catch { /* best effort */ }

  console.log(`Installed Finder Quick Action: ${join(services, QUICK_ACTION_NAME)}`);
  console.log(`  node: ${nodePath}`);
  console.log(`  cli:  ${cliPath}`);
}
