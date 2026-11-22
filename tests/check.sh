#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/panopticon-check.XXXXXXXX")"
trap 'rm -r -- "$scratch"' EXIT
export HERDR_APP_HOME="$scratch/home"
mod="$HERDR_APP_HOME/mods/panopticon"
mkdir -p "$mod" "$scratch/fixture" "$HERDR_APP_HOME/icons"

# Local test-only icons exercise both regular-pane rendering paths without installed assets.
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><path d="M2 2h10v10H2z"/></svg>' > "$HERDR_APP_HOME/icons/test-mono.svg"
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><path fill="#ff765c" d="M0 0h7v14H0z"/><path fill="#abefdc" d="M7 0h7v14H7z"/></svg>' > "$HERDR_APP_HOME/icons/test-color.svg"

# The checker generates editor-support files. Keep them out of the checkout.
cp "$root/mods/panopticon/main.js" "$root/mods/panopticon/mod.json" "$mod/"
herdr-app check "$mod"
cp "$mod/main.js" "$scratch/fixture/panopticon.js"
cp "$root/tests/grid.js" "$scratch/fixture/main.js"
herdr-app check "$scratch/fixture" --print-spec > "$scratch/render-spec.txt"
grep '^check passed:' "$scratch/render-spec.txt"
# Check actual native descriptions, not just the caption metadata. Iconless rows add no icon.
grep -Fq 'image "icons/test-color.svg" .w[Number(14.0)] .h[Number(14.0)] .flex_none' "$scratch/render-spec.txt"
grep -Fq 'svg "icons/test-mono.svg" .size[Number(14.0)] .flex_none .text_color[Str("#677777")]' "$scratch/render-spec.txt"
grep -Fq 'svg "icons/test-mono.svg" .size[Number(14.0)] .flex_none .text_color[Str("#526573")]' "$scratch/render-spec.txt"
[[ "$(grep -cE '^[[:space:]]+(svg|image) "icons/test-' "$scratch/render-spec.txt")" == 3 ]]
bash "$root/tests/install.sh"
