# Changelog

## 1.0.0 (2026-08-13)


### Features

* Anthropic vision backend (claude-haiku-4-5 default via factory) ([10a3e97](https://github.com/FrankLedo/receiptnamer/commit/10a3e9720eb893a8b9ee377e0ac7b86ac940f138))
* backend factory with per-backend default model and key check ([7fda072](https://github.com/FrankLedo/receiptnamer/commit/7fda072615b4a830f9b68f9c9295284924c29fa4))
* CLI entry, dispatch, run summary, and skip notification ([d4deb9f](https://github.com/FrankLedo/receiptnamer/commit/d4deb9f6bbbb1a5235d076f010f447237bde832c))
* collision-safe in-place rename with dry-run ([196e90e](https://github.com/FrankLedo/receiptnamer/commit/196e90e65d2302a9c7985693d2fce0af045da228))
* config load/init, path precedence, and scan-date helper ([5269f9f](https://github.com/FrankLedo/receiptnamer/commit/5269f9f4b74b2bd48dc9f01274f3fb000744be6e))
* macOS launchd watcher and Finder Quick Action installers ([667b530](https://github.com/FrankLedo/receiptnamer/commit/667b530d0b3401f0de58f97d6e2331036d980359))
* Namer interface and Ollama vision backend ([b874eec](https://github.com/FrankLedo/receiptnamer/commit/b874eec2448b3740b0fe7740094b254e23847fc9))
* naming prompt and model-output cleanup ([a473f90](https://github.com/FrankLedo/receiptnamer/commit/a473f90d4a92fb0f81961de0d0317f633592e529))
* per-file orchestration (render -&gt; name -&gt; rename) with error outcomes ([0fbe2ad](https://github.com/FrankLedo/receiptnamer/commit/0fbe2ad17471f11b81b0bc7329ff1353553fe0a6))
* render PDF page 1 to a long-edge-capped PNG buffer ([7a6721d](https://github.com/FrankLedo/receiptnamer/commit/7a6721dc0e83214492f44738cf4aaa49320f1975))
* scanned-receipt watcher (one-pass + chokidar long-run) ([41f78bb](https://github.com/FrankLedo/receiptnamer/commit/41f78bb27a7bfab3209f9fb71949bd06ba858242))
* watcher notifies only on newly-skipped files (persist skip state across --watch-run cycles) ([dcbfc83](https://github.com/FrankLedo/receiptnamer/commit/dcbfc83c9d0dac5608c1ba4d057cfedbb4089406))


### Bug Fixes

* realpath bin guard, soft-fail watcher + missing paths, doc/cleanup nits ([ad6f066](https://github.com/FrankLedo/receiptnamer/commit/ad6f066055417ef4c05f9924bf5873ec01e0cc79))
* stop baking version-pinned node paths into macOS installers ([b8439bc](https://github.com/FrankLedo/receiptnamer/commit/b8439bc1c84e542cb9cc1c0b25640850470c9c5e))
* use basename() in watcher for cross-platform path handling ([32e4ecb](https://github.com/FrankLedo/receiptnamer/commit/32e4ecbfc533b170e64ead0339be236cd2e486e2))

## [Unreleased]
### Fixed
- macOS installers no longer bake Homebrew's version-pinned
  `Cellar/node/<version>/bin/node` into the Quick Action and launchd plist, which
  broke both on every `brew upgrade node`. Paths are de-versioned to
  `opt/node/bin/node`, and the Quick Action additionally probes a candidate list
  (Homebrew, `/usr/local`, `/usr/bin`, nvm) at run time.
- Quick Action no longer depends on `PATH`. Services run a non-interactive zsh
  with `PATH=/bin:/usr/bin:/usr/ucb:/usr/local/bin`, which never sources
  `~/.zshrc`, so neither `node` nor `receiptnamer` resolved by name.
- Quick Action reports missing node/CLI as a notification instead of failing
  silently — Automator discards stderr, so previous breakages were invisible.
- Generated `document.wflow` now carries the Automator keys (`ActionBundlePath`,
  `BundleIdentifier`, `workflowMetaData`) the Run Shell Script action needs to
  load at all, and the embedded script is XML-escaped so `2>&1` cannot produce a
  malformed plist.
- `--install-quickaction` installs under one canonical name
  (`receiptnamer.workflow`), removes the legacy `Rename Receipt.workflow`, and
  flushes the Services registry so the menu item appears immediately.

### Added
- Initial Node/TypeScript rewrite: vision-first receipt naming from the rendered
  page image (no OCR), with Ollama (default, qwen2.5vl:7b) and Anthropic
  (claude-haiku-4-5) backends, cross-platform watcher, and macOS installers.
