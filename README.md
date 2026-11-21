# Panopticon

A global grid of **live agent terminals** for [Herdr Desktop](https://herdr.dev). See agents from every space at once, type directly into a tile, and return to the layout you were using. No dashboard space, duplicated sessions, or polling terminal output.

**Demo:** Four agents across three spaces (32 seconds). [Text walkthrough](presentation/README.md#walkthrough)

https://github.com/user-attachments/assets/f749a976-a4f1-40b1-ab5c-716ec52f17d8

## Try it

Tested on Linux with Herdr Desktop **0.1.16** and herdr-core **0.1.21**. No build, package installation, or API key is needed for the mod.

```sh
git clone --branch v0.1.0 https://github.com/eapolinario/herdr-panopticon.git
cd herdr-panopticon
```

Copy `mods/panopticon/` into your Herdr app's `mods/` directory. On Linux or macOS, this example **refuses to overwrite an existing mod**:

```sh
(
  set -eu
  app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
  dest="$app_home/mods/panopticon"
  mkdir -p "$app_home/mods"
  mkdir "$dest"
  cp mods/panopticon/main.js mods/panopticon/mod.json "$dest/"
  herdr-app check "$dest"
)
```

With Herdr running, toggle the grid from any space:

```sh
herdr-app do mod.open --name panopticon
```

For **Ctrl+Shift+G**, merge the single binding from [keys.json](keys.json) into your own `keys.json` **only if the chord is free**. Don't replace your keymap. You can pick another key or just use the command and the **Back** button.

## Using the grid

- **Click inside a terminal** to work in it. This is the real terminal, not a screenshot. Its rows and columns resize to fit the tile.
- **Click a caption** to return to the agent's original pane, or to peek at a helper that doesn't have a pane. Captions identify the program, space, tab, address and status.
- **Toggle again or click Back** to return to your previous layout. The original spaces, tabs and splits stay intact.
- Quiet and settled tabs count too. Live agent helpers are included under their owning tab; ordinary shells, finished terminals, and unrelated core workers are excluded. Opening and closing agent sessions updates the grid. A status change doesn't reshuffle it.

## Local state and removal

On first use the mod creates **`layouts/panopticon.json`** in the Herdr app home. This is a personal runtime layout with local session addresses, not a file to install or share. A pre-existing unrelated layout with that name is left alone. The previous layout name is remembered in Herdr's shared state. The mod uses Herdr's native terminal blocks; it does not read scrollback, invoke shell commands, or make network requests.

To uninstall, switch back, remove the binding you added and remove the installed `mods/panopticon/` folder. You can also remove `layouts/panopticon.json` **if Panopticon generated it** (its root ID is `panopticon-agent-grid`). This doesn't end sessions.

## Development

Run `bash tests/check.sh`. It checks a clean mod copy and exercises agent selection and grid geometry using Herdr's own checker in a temporary app home. No running Herdr window is needed. [RECIPE.md](RECIPE.md) describes how to reproduce the view.
