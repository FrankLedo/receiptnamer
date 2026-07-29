# Changelog

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
