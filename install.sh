#!/bin/sh
# Download the released mod without a checkout, build tools, or elevated permissions.
set -eu

ref=v0.3.0
app_home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
uninstall=0
marker=.herdr-panopticon

usage() {
  printf '%s\n' \
    'Usage: sh install.sh [--app-home PATH] [--ref TAG_OR_BRANCH] [--uninstall]' \
    '' \
    'Installs the released Panopticon mod (v0.3.0 by default) and checks it with herdr-app.' \
    'Run again to update an installer-managed copy. Existing unmarked mods are refused.' \
    'Uses HERDR_APP_HOME, otherwise ~/.config/herdr-app. Keys and layouts are never edited.' \
    'Switch back from the grid before using --uninstall; sessions are not stopped.'
}

fail() {
  printf 'panopticon: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-home|--ref)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail "$1 needs a value (see --help)."
      if [ "$1" = --app-home ]; then app_home=$2; else ref=$2; fi
      shift 2
      ;;
    --uninstall) uninstall=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1 (see --help)." ;;
  esac
done

# Absolute paths also keep file-operation arguments from being mistaken for options.
case "$app_home" in /*) ;; *) app_home="$PWD/$app_home" ;; esac
dest="$app_home/mods/panopticon"

managed() {
  [ -d "$dest" ] && [ ! -L "$dest" ] &&
    [ -f "$dest/$marker" ] && [ ! -L "$dest/$marker" ] || return 1
  IFS= read -r owner < "$dest/$marker" || return 1
  [ "$owner" = 'herdr-panopticon installer' ]
}

check_destination() {
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    managed || fail "Refusing to change $dest: it is not an installer-managed directory (or is a symlink). Back up or move a manual install first."
  fi
}

check_destination
if [ "$uninstall" -eq 1 ]; then
  if [ -d "$dest" ]; then
    rm -rf -- "$dest"
    printf 'Removed Panopticon from %s.\n' "$dest"
  else
    printf 'Panopticon is not installed at %s.\n' "$dest"
  fi
  printf '%s\n' 'Keys and runtime layouts were left untouched. No sessions were stopped.'
  exit 0
fi

for tool in curl herdr-app; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool must be on PATH."
done

scratch=
stage=
new_dest=
cleanup() {
  [ -z "$stage" ] || rm -rf -- "$stage"
  [ -z "$scratch" ] || rm -rf -- "$scratch"
  [ -z "$new_dest" ] || rm -rf -- "$new_dest"
}
trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

scratch="$(mktemp -d "${TMPDIR:-/tmp}/panopticon-install.XXXXXXXX")"
mkdir "$scratch/mod" "$scratch/app-home"
base="https://raw.githubusercontent.com/eapolinario/herdr-panopticon/$ref/mods/panopticon"
for file in main.js mod.json; do
  curl -fsSL --connect-timeout 15 --max-time 60 -o "$scratch/mod/$file" "$base/$file" ||
    fail "Could not download $file from $ref; the installed mod was not changed."
done

# Checking is isolated: no live app, user layouts, or generated editor files are needed.
HERDR_APP_HOME="$scratch/app-home" herdr-app check "$scratch/mod" ||
  fail 'The downloaded mod failed herdr-app check; the installed mod was not changed.'

# Stage on the destination filesystem so replacing each shipped file is atomic.
mkdir -p "$app_home/mods"
stage="$(mktemp -d "$app_home/mods/.panopticon-install.XXXXXXXX")"
cp "$scratch/mod/main.js" "$scratch/mod/mod.json" "$stage/"
printf '%s\n' 'herdr-panopticon installer' > "$stage/$marker"
check_destination
if [ ! -d "$dest" ]; then
  mkdir "$dest"
  new_dest=$dest
fi
for file in mod.json main.js "$marker"; do
  [ ! -d "$dest/$file" ] || fail "Refusing to replace a directory: $dest/$file"
done
for file in mod.json main.js "$marker"; do
  mv -f -- "$stage/$file" "$dest/$file"
done
new_dest=

printf 'Installed Panopticon (%s) in %s.\n' "$ref" "$dest"
printf '%s\n' \
  'Keys and layouts were left untouched. With Herdr running, toggle the grid with:' \
  '  herdr-app do mod.open --name panopticon' \
  'Optional shortcut: merge "ctrl-shift-g": "mod.open:panopticon" into keys.json global, only if free.'
