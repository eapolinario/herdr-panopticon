#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/panopticon-check.XXXXXXXX")"
trap 'rm -r -- "$scratch"' EXIT
export HERDR_APP_HOME="$scratch/home"
mod="$HERDR_APP_HOME/mods/panopticon"
mkdir -p "$mod" "$scratch/fixture"

# The checker generates editor-support files. Keep them out of the checkout.
cp "$root/mods/panopticon/main.js" "$root/mods/panopticon/mod.json" "$mod/"
herdr-app check "$mod"
cp "$mod/main.js" "$scratch/fixture/panopticon.js"
cp "$root/tests/grid.js" "$scratch/fixture/main.js"
herdr-app check "$scratch/fixture"
bash "$root/tests/install.sh"
