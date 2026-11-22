# Changelog

## Unreleased

### Added
- The grid now marks the currently focused terminal with a highlighted caption, accent dot and native tile focus border.

## 0.3.0 — 2026-11-22

### Added
- Grid navigation with `Alt+Left/Right/Up/Down` and `Alt+H/J/K/L`.
- Existing Alt-arrow/HJKL bindings are temporarily redirected while the grid is open and restored on leave.

### Changed
- The grid toolbar is now focusable and owns the temporary navigation bindings.
- The installer defaults to `v0.3.0`.

## 0.2.0 — 2026-11-21

### Added
- Bentham-inspired icon and wordmark, with light/dark and monochrome SVGs, PNG logos, an app/avatar icon, and small-size favicons.
- A theme-aware native mark in the toolbar and empty state, without adding artwork or font dependencies to the installed mod.
- A pinned Nix development environment, direnv integration, reproducible branding exports, and CI using Herdr's own checker.

### Changed
- Captions lead with the existing tab name; workspace and tool are secondary. Unnamed tabs read “Tab 1,” helpers are identified, and addresses stay in tooltips except where identical labels need a visible ID.
- The installer now defaults to `v0.2.0`.

The installation still consists of two mod files plus an ownership marker. Session selection, grid geometry, status colors, navigation, and keyboard shortcuts are unchanged. The installer still leaves keys and runtime layouts alone.

## 0.1.0 — 2026-11-21

- Initial global grid of live agent terminals across all Herdr spaces, with direct input, caption navigation, and return to the previous layout.
