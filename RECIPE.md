# Panopticon

Switch the entire Herdr window to an evenly spaced grid of live agent terminals, irrespective of the selected space. Find an agent by its space and tab, watch it work, type in its tile, or go back to where that agent lives.

![Panopticon](preview.png)

## Adding it (for the app's agent)

Use the installer; no cloning or build is needed. It requires `curl` and
`herdr-app` on `PATH`, but no running app, sudo, or additional packages.
Tested on Linux with Herdr Desktop 0.1.16 and herdr-core 0.1.21. The shell
script also targets macOS, which is not yet tested; there is no Windows
installer.

Tell the person first what it does:

- downloads the two standalone mod files from the GitHub **v0.4.0** tag,
  checks them with `herdr-app check` in a temporary app home, and installs
  them plus a `.herdr-panopticon` ownership marker into
  `~/.config/herdr-app/mods/panopticon/`;
- leaves their keymap and existing layouts alone. On first opening, the mod
  creates its own `layouts/panopticon.json` with local terminal addresses
  and remembers the previous layout in shared state;
- displays real terminal blocks, which resize to their tiles. The mod does
  not read scrollback, run programs, or make network requests; only the
  installer downloads from GitHub.

```sh
curl -fsSL https://raw.githubusercontent.com/eapolinario/herdr-panopticon/main/install.sh | sh
```

Export `HERDR_APP_HOME` if the app uses another home, or use
`| sh -s -- --app-home /path/to/herdr-app`. Running the installer again
updates an installer-managed copy; an unmarked or symlinked mod directory
is refused, not overwritten. Move or back up an older manual install first.
`--ref TAG_OR_BRANCH` selects another mod version.

With the app open, toggle from any space:

```sh
herdr-app do mod.open --name panopticon
```

Offer **Ctrl+Shift+G** by merging `"ctrl-shift-g": "mod.open:panopticon"`
into `global` in the person's `keys.json` only where free. The installer
never edits keys; [keys.json](keys.json) is a snippet, not a replacement.

For removal, switch back first, remove any binding you added, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/eapolinario/herdr-panopticon/main/install.sh | sh -s -- --uninstall
```

Use the same app home. This removes only the managed mod directory; it
leaves keys and runtime layouts in place and stops no sessions. Remove the
runtime layout only if its root ID is `panopticon-agent-grid`. For a manual
install, remove the mod folder yourself.

## What you see

A 34 px toolbar shows a **24 px Bentham-inspired mark** beside **Panopticon**, **All spaces**, and the agent count; **Back** is on the right. Below it, each tile has a 26 px caption over a live terminal. The caption leads with the existing tab name in bold, followed by workspace and program in muted text; unnamed tabs read **Tab 1**, **Tab 2**, etc. Helpers are identified in the metadata. The full title, terminal address and destination stay in the tooltip; a small address badge is visible only for otherwise-identical captions. Status stays at the right. The grid uses 4 px outer padding and gaps, 1 px theme-colored tile borders, the theme's chrome and foreground colors, and 12 px terminal type. With four agents there are two equal rows of two. With none, the Back button stays above a **48 px mark** and the empty-state message. The mark's ring uses the theme's foreground and its four central panes use the accent.

## How it behaves

- Open or leave the view with `mod.open:panopticon`; the suggested binding is Ctrl+Shift+G. Back restores the previous layout (or `main` if it no longer exists).
- The focused terminal gets the theme accent on its tile border, a highlighted caption and an accent dot; caption tooltips say `Currently focused`.
- Use `Alt+Left/Right/Up/Down` or `Alt+H/J/K/L` to focus neighboring tiles. While the grid is open, existing bindings for those chords are redirected to grid navigation and restored on leave.
- A working agent shows **Working**, a blocked or error report shows **Needs you**, done shows **Done**, and idle shows **Idle**. The words use the matching theme colors. A recognized agent without a status shows **Open**. Status changes don't move tiles.
- The terminal body takes real input, including Escape. Caption names are only a presentation of existing Herdr tab names, not a separate naming registry; status and activity-title changes never rename or reorder tiles. Hover over the caption for full location, title/address and destination. Click the caption to return to the original pane; a live helper without one opens in Peek over its owning tab.
- Adding/removing agents updates the grid in pane order. The last row leaves empty columns rather than stretching the last tile. Changing the selected space does not filter the view.

## Built from

One standalone mod, `mods/panopticon/`, with `place: none`. Its small launcher overlay switches to a personal top-level layout, not a tab or space. Make a column with a toolbar and rows, using `ceil(sqrt(agentCount))` columns. Each cell is a column with a caption block and a native `{ terminal: address }` block. Use a weighted spacer at the end of a short row. The mod's block roles are `bar`, `caption`, `spacer` and `empty`; there are no shipped mod or artwork dependencies. `brandMark()` draws cached, percentage-based GPUI paths inside the same `main.js`; no SVG file or font is loaded. Its JSON-compatible `BRAND_GEOMETRY` block also supplies the repository's exported icon and logo geometry.

Use `spaces()`, `panes()`, `agents()` and `terminals()` to find sessions. Start at terminal panes in **all** tabs; follow live children even through non-agent workers. Keep only recognized or reporting agents. Use the full machine-qualified address and visit it once. A helper that already has its own pane belongs there, not under its parent as well.

Create the runtime layout with `readTextFile` / `writeTextFile` under `appHome()/layouts/`, using the expected previous contents to avoid overwriting concurrent edits. Remember the previous layout with `shared` / `setShared`. Use `layout.switch` to enter or leave; use `layout.set` **only on the mod's own layout** when membership or tab ownership changes. While open, redirect bindings already present for the eight supported Alt+arrow/HJKL chords through `cx.bind_keys`, restore them in `close(cx)` or Back, and handle the resulting mod commands with `pane.focus { terminal }`. For a caption click, use `pane.focus` or `tab.select` plus `terminal.peek`. No `exec`, `hc`, network calls, periodic screen reads, or screenshot capture in the mod.

## Watch out

- Never ship a generated layout with real terminal addresses. Refuse an existing `panopticon.json` without the mod's root ID and toolbar. Allow time for Herdr to discover a newly created layout.
- A live terminal resizes to its tile. The grid has no paging; with many agents the tiles get small. Known agents and status reports are the signal, not guesses from arbitrary shell text.
- Keep the launcher side-effect-free under `herdr-app check`. Keep the JavaScript self-contained so individually symlinked installs work. The optional keys file is a snippet, not a replacement keyboard configuration.

## Done when

`bash tests/check.sh` passes. With agents in different spaces (including split or settled tabs), toggling opens one live tile per agent and skips plain shells. A status change keeps the tile in place. Clicking a caption takes you to the right pane or helper; Alt+arrow and Alt+HJKL move between neighboring tiles and restore their normal bindings on leave. Toggling back restores the previous layout without creating, moving or ending sessions.
