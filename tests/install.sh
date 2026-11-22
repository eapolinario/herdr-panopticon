#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/panopticon-installer-test.XXXXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/bin" "$scratch/source" "$scratch/tmp" "$scratch/default-home"
cp "$root/mods/panopticon/main.js" "$root/mods/panopticon/mod.json" "$scratch/source/"
export HOME="$scratch/default-home" TMPDIR="$scratch/tmp" PATH="$scratch/bin:$PATH"
export PANOPTICON_TEST_SOURCE="$scratch/source"
export PANOPTICON_TEST_DOWNLOADS="$scratch/downloads" PANOPTICON_TEST_CHECKS="$scratch/checks"
unset HERDR_APP_HOME
: > "$PANOPTICON_TEST_DOWNLOADS"
: > "$PANOPTICON_TEST_CHECKS"

# No network or live app: serve local fixtures and model the checker's generated files.
cat > "$scratch/bin/curl" <<'SH'
#!/bin/sh
set -eu
output=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -fsSL) shift ;;
    --connect-timeout|--max-time) shift 2 ;;
    -o) output=$2; shift 2 ;;
    https://raw.githubusercontent.com/eapolinario/herdr-panopticon/*/mods/panopticon/*)
      url=$1; shift ;;
    *) printf 'Unexpected curl argument: %s\n' "$1" >&2; exit 1 ;;
  esac
done
[ -n "$output" ] && [ -n "$url" ]
printf '%s\n' "$url" >> "$PANOPTICON_TEST_DOWNLOADS"
file=${url##*/}
[ "${PANOPTICON_TEST_DOWNLOAD_FAIL:-}" != "$file" ] || exit 22
cp "$PANOPTICON_TEST_SOURCE/$file" "$output"
SH
cat > "$scratch/bin/herdr-app" <<'SH'
#!/bin/sh
set -eu
[ "$#" -eq 2 ] && [ "$1" = check ]
[ -f "$2/main.js" ] && [ -f "$2/mod.json" ]
case "$HERDR_APP_HOME" in
  "$TMPDIR"/panopticon-install.*/app-home) ;;
  *) printf 'Checker used a non-isolated app home\n' >&2; exit 1 ;;
esac
printf '%s\n' "$HERDR_APP_HOME" >> "$PANOPTICON_TEST_CHECKS"
[ "${PANOPTICON_TEST_CHECK_FAIL:-}" != 1 ] || exit 1
printf 'generated editor support\n' > "$2/editor-support.txt"
SH
chmod +x "$scratch/bin/curl" "$scratch/bin/herdr-app"

install() {
  sh "$root/install.sh" "$@" > "$scratch/output" 2>&1
}
reject() {
  if install "$@"; then
    printf 'Expected installer to reject: %s\n' "$*" >&2
    exit 1
  fi
}

# Help and invalid arguments have no side effects.
install --help
reject --unknown
reject --app-home
reject --ref ''
[[ ! -e "$HOME/.config" && ! -s "$PANOPTICON_TEST_DOWNLOADS" ]]

# Default home, pinned release, and only the two shipped files plus ownership marker.
install
default_mod="$HOME/.config/herdr-app/mods/panopticon"
cmp "$scratch/source/main.js" "$default_mod/main.js"
cmp "$scratch/source/mod.json" "$default_mod/mod.json"
[[ -f "$default_mod/.herdr-panopticon" && ! -e "$default_mod/editor-support.txt" ]]
grep -q '/v0.4.0/mods/panopticon/main.js$' "$PANOPTICON_TEST_DOWNLOADS"
grep -q 'herdr-app do mod.open --name panopticon' "$scratch/output"

# An exported app home with spaces is honored; keys and unrelated runtime layouts survive.
export HERDR_APP_HOME="$scratch/custom home"
mod="$HERDR_APP_HOME/mods/panopticon"
mkdir -p "$HERDR_APP_HOME/layouts"
printf '%s\n' '{"global":{"ctrl-shift-g":"user.action"},"terminal":{"ctrl-x":"other.action"}}' > "$HERDR_APP_HOME/keys.json"
printf '%s\n' '{"id":"unrelated-layout"}' > "$HERDR_APP_HOME/layouts/panopticon.json"
cp "$HERDR_APP_HOME/keys.json" "$scratch/keys-before.json"
cp "$HERDR_APP_HOME/layouts/panopticon.json" "$scratch/layout-before.json"
install
cmp "$scratch/keys-before.json" "$HERDR_APP_HOME/keys.json"
cmp "$scratch/layout-before.json" "$HERDR_APP_HOME/layouts/panopticon.json"
cp "$mod/main.js" "$scratch/main-before.js"
cp "$mod/mod.json" "$scratch/mod-before.json"

# The documented stdin invocation supports flags and overrides the environment.
flag_home="$scratch/flag home"
sh -s -- --app-home "$flag_home" --ref main < "$root/install.sh" > "$scratch/output" 2>&1
cmp "$scratch/source/main.js" "$flag_home/mods/panopticon/main.js"
grep -q '/main/mods/panopticon/mod.json$' "$PANOPTICON_TEST_DOWNLOADS"
(
  cd "$scratch"
  install --app-home relative-home
)
[[ -f "$scratch/relative-home/mods/panopticon/main.js" ]]

# Partial downloads and failed validation leave both new and installed destinations alone.
printf '\n// updated fixture\n' >> "$scratch/source/main.js"
export PANOPTICON_TEST_DOWNLOAD_FAIL=mod.json
reject
reject --app-home "$scratch/download-failed"
[[ ! -e "$scratch/download-failed" ]]
cmp "$scratch/main-before.js" "$mod/main.js"
cmp "$scratch/mod-before.json" "$mod/mod.json"
unset PANOPTICON_TEST_DOWNLOAD_FAIL
export PANOPTICON_TEST_CHECK_FAIL=1
reject
reject --app-home "$scratch/check-failed"
[[ ! -e "$scratch/check-failed" ]]
cmp "$scratch/main-before.js" "$mod/main.js"
cmp "$scratch/mod-before.json" "$mod/mod.json"
unset PANOPTICON_TEST_CHECK_FAIL
install --ref main
cmp "$scratch/source/main.js" "$mod/main.js"

# Never adopt a manual install, even one with the same mod files, or follow a mod symlink.
manual_home="$scratch/manual"
mkdir -p "$manual_home/mods/panopticon"
cp "$scratch/source/main.js" "$scratch/source/mod.json" "$manual_home/mods/panopticon/"
calls_before="$(wc -l < "$PANOPTICON_TEST_DOWNLOADS")"
reject --app-home "$manual_home"
reject --app-home "$manual_home" --uninstall
cmp "$scratch/source/main.js" "$manual_home/mods/panopticon/main.js"
linked_home="$scratch/linked"
mkdir -p "$linked_home/mods"
ln -s "$mod" "$linked_home/mods/panopticon"
reject --app-home "$linked_home"
reject --app-home "$linked_home" --uninstall
[[ -L "$linked_home/mods/panopticon" ]]
rm "$linked_home/mods/panopticon"
ln -s "$scratch/missing-mod" "$linked_home/mods/panopticon"
reject --app-home "$linked_home"
[[ -L "$linked_home/mods/panopticon" ]]
printf 'not our marker\n' > "$mod/.herdr-panopticon"
reject
reject --uninstall
printf 'herdr-panopticon installer\n' > "$mod/.herdr-panopticon"
[[ "$(wc -l < "$PANOPTICON_TEST_DOWNLOADS")" -eq "$calls_before" ]]

# Replacing a managed entry-file symlink must not overwrite its external target.
printf 'external file\n' > "$scratch/external.js"
cp "$scratch/external.js" "$scratch/external-before.js"
rm "$mod/main.js"
ln -s "$scratch/external.js" "$mod/main.js"
install
[[ ! -L "$mod/main.js" ]]
cmp "$scratch/source/main.js" "$mod/main.js"
cmp "$scratch/external-before.js" "$scratch/external.js"

# Uninstall is repeatable, does not download/check anything, and preserves personal state.
calls_before="$(wc -l < "$PANOPTICON_TEST_DOWNLOADS")"
checks_before="$(wc -l < "$PANOPTICON_TEST_CHECKS")"
install --uninstall
install --uninstall
[[ ! -e "$mod" ]]
cmp "$scratch/keys-before.json" "$HERDR_APP_HOME/keys.json"
cmp "$scratch/layout-before.json" "$HERDR_APP_HOME/layouts/panopticon.json"
[[ "$(wc -l < "$PANOPTICON_TEST_DOWNLOADS")" -eq "$calls_before" ]]
[[ "$(wc -l < "$PANOPTICON_TEST_CHECKS")" -eq "$checks_before" ]]
[[ -z "$(find "$scratch/tmp" -mindepth 1 -print -quit)" ]]
[[ -z "$(find "$scratch" -name '.panopticon-install.*' -print -quit)" ]]
printf 'Panopticon installer checks passed.\n'
