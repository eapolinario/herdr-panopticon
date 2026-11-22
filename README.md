<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/brand/logo-dark.svg">
    <img src="media/brand/logo.svg" alt="Panopticon" width="480">
  </picture>
</h1>

A global grid of **live agent terminals** for [Herdr Desktop](https://herdr.dev). See agents from every space at once, type directly into a tile, and return to the layout you were using. No dashboard space, duplicated sessions, or polling terminal output.

**Demo:** Four agents across three spaces (32 seconds). [Text walkthrough](presentation/README.md#walkthrough)

https://github.com/user-attachments/assets/f749a976-a4f1-40b1-ab5c-716ec52f17d8

## Install

Tested on Linux with Herdr Desktop **0.1.16** and herdr-core **0.1.21**. The shell installer also targets macOS, but that is not yet tested. Have `herdr-app` and `curl` on your `PATH`; no Git checkout, build, package installation, sudo, or API key is needed. Herdr does not need to be running during installation.

[The installer](install.sh) downloads the released **v0.4.0** mod from GitHub, runs `herdr-app check` in a temporary app home, and installs its two files plus an ownership marker into your app home's `mods/panopticon/`. **It does not edit your keys or existing layouts.**

```sh
curl -fsSL https://raw.githubusercontent.com/eapolinario/herdr-panopticon/main/install.sh | sh
```

The app home defaults to `~/.config/herdr-app`. For a custom home, export `HERDR_APP_HOME` first, or use `| sh -s -- --app-home /path/to/herdr-app` instead of `| sh`.

Run the same command again to update an installer-managed copy. An existing manual install or symlinked mod directory is **left untouched**: back it up or move it aside before installing. To install a different tag or branch, use `| sh -s -- --ref TAG_OR_BRANCH`.

With Herdr running, toggle the grid from any space:

```sh
herdr-app do mod.open --name panopticon
```

### Optional shortcut

For **Ctrl+Shift+G**, merge this binding into `global` in your app home's `keys.json` **only if the chord is free**:

```json
{
  "global": {
    "ctrl-shift-g": "mod.open:panopticon"
  }
}
```

This is a snippet, **not a replacement keymap**. Pick another key if needed, or just use the command and the **Back** button.

## Using the grid

The toolbar and empty state show the Bentham-inspired mark in your Herdr theme's foreground and accent colors.

- **Click inside a terminal** to work in it. This is the real terminal, not a screenshot. Its rows and columns resize to fit the tile.
- **The currently focused tile is marked** with the theme accent, a highlighted caption and an accent dot; hover or read the tooltip for `Currently focused`.
- **Use `Alt+Left/Right/Up/Down` or `Alt+H/J/K/L`** to move between neighboring tiles in the grid. While the grid is open, Herdr temporarily redirects existing bindings for these chords to tile navigation and restores them when you leave.
- **Click a caption** to return to the agent's original pane, or to peek at a helper that doesn't have a pane. Captions lead with the existing tab name in bold, followed by the workspace and tool in muted text; unnamed tabs appear as **Tab 1**, **Tab 2**, etc. Helpers are marked as such. Hover for the full title, terminal address and destination; a small address badge appears only when otherwise-identical labels need disambiguation. Status stays on the right.
- **Toggle again or click Back** to return to your previous layout. The original spaces, tabs and splits stay intact.
- Quiet and settled tabs count too. Live agent helpers are included under their owning tab; ordinary shells, finished terminals, and unrelated core workers are excluded. Opening and closing agent sessions updates the grid. A status change doesn't reshuffle it.

## Local state and removal

On first use the mod creates **`layouts/panopticon.json`** in the Herdr app home. This is a personal runtime layout with local session addresses, not a file to install or share. A pre-existing unrelated layout with that name is left alone. The previous layout name is remembered in Herdr's shared state. The mod uses Herdr's native terminal blocks; it does not read scrollback, invoke shell commands, or make network requests.

To uninstall, **switch back first** and remove any binding you added, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/eapolinario/herdr-panopticon/main/install.sh | sh -s -- --uninstall
```

Use the same app home as for installation (`HERDR_APP_HOME` or `--app-home`). The uninstaller removes only an installer-managed `mods/panopticon/` directory and leaves keys and runtime layouts alone. For an older manual install, remove the mod folder yourself.

You can also remove `layouts/panopticon.json` **if Panopticon generated it** (its root ID is `panopticon-agent-grid`). This doesn't end sessions.

## Development

The [Nix flake](flake.nix) provides a development shell on x86_64 and aarch64 Linux. `flake.lock` pins the tools: Bash, standard command-line utilities, Git, curl, ShellCheck and nixfmt; Python with NumPy, Playwright, FontTools, HarfBuzz and Pillow; Chromium, FFmpeg, librsvg, ImageMagick and Adwaita fonts. It does not install or configure Herdr.

```sh
nix develop
nix flake check        # Pinned Herdr checker, captions, branding, installer and shell lint.
bash tests/check.sh   # Full checks; requires herdr-app on PATH.
```

With [direnv](https://direnv.net), the checked-in [`.envrc`](.envrc) loads the same shell: run `direnv allow` once instead of `nix develop`. Local `.direnv/` state is ignored. Nix must have the `nix-command` and `flakes` experimental features enabled.

CI runs `nix flake check` with a test-only Herdr 0.1.16 binary pinned to the official release checksum; it does not install or configure the desktop app. `bash tests/check.sh` uses the `herdr-app` on your PATH in a temporary app home to exercise agent selection, grid geometry, caption presentation/disambiguation, and native mark rendering at both sizes with dark/light colors. These checks also test installation, updates, refusal to overwrite unowned mods, and removal with local download fixtures and a mock checker. No running Herdr window or network access is needed **after the development tools are downloaded**.

Inside the shell, `python branding/build.py` rebuilds the icon and logo; [branding/README.md](branding/README.md) has the design rationale, downloads and usage notes. `python presentation/render.py` rebuilds the showcase without additional Python or browser downloads; see [presentation/README.md](presentation/README.md). The shell supplies a Fontconfig configuration for consistent Adwaita typography. `nix develop .#ui` additionally provides Weston and Xwayland for private native-UI testing; the compositor still needs a working graphics driver. Use `nix fmt` to format the flake and `nix flake update` to deliberately refresh the pinned dependencies. [RECIPE.md](RECIPE.md) describes the installation footprint and how to reproduce the view.
