{
  description = "Panopticon mod development and artwork/showcase tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (
        pkgs:
        let
          python = pkgs.python3.withPackages (
            ps: with ps; [
              fonttools
              numpy
              pillow
              playwright
              uharfbuzz
            ]
          );
          fontsConf = pkgs.makeFontsConf {
            fontDirectories = [ pkgs.adwaita-fonts ];
            impureFontDirectories = [ ];
            includes = [ ];
          };
        in
        rec {
          default = pkgs.mkShellNoCC {
            name = "panopticon-dev";
            packages = with pkgs; [
              bashInteractive
              coreutils
              curl
              diffutils
              findutils
              git
              gnugrep
              gnused
              shellcheck
              nixfmt
              python
              chromium
              ffmpeg-headless.bin
              librsvg.out
              imagemagick.out
              fontconfig.bin
              adwaita-fonts
            ];

            # Keep typography independent of the host's installed fonts.
            FONTCONFIG_FILE = fontsConf;
            # The renderer uses the Nix-provided Chromium executable directly.
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

            shellHook = ''
              if ! command -v herdr-app >/dev/null 2>&1; then
                printf '%s\n' 'herdr-app is not on PATH; full mod checks require a separate Herdr installation.' >&2
              fi
            '';
          };

          # Optional tools for a private display; no real desktop/input automation.
          ui = default.overrideAttrs (old: {
            name = "panopticon-ui";
            nativeBuildInputs = old.nativeBuildInputs ++ [
              pkgs.weston
              pkgs.xwayland
            ];
          });
        }
      );

      checks = forAllSystems (
        pkgs:
        let
          brandPython = pkgs.python3.withPackages (
            ps: with ps; [
              fonttools
              pillow
              uharfbuzz
            ]
          );
          brandFontsConf = pkgs.makeFontsConf {
            fontDirectories = [ pkgs.adwaita-fonts ];
            impureFontDirectories = [ ];
            includes = [ ];
          };
          brandSource = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./branding/build.py
              ./branding/test_branding.py
              ./mods/panopticon/main.js
              ./media/brand
            ];
          };
          herdrChecker = pkgs.callPackage ./nix/herdr-checker.nix { };
          modSource = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./install.sh
              ./mods/panopticon/main.js
              ./mods/panopticon/mod.json
              ./tests
            ];
          };
          installerSource = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./install.sh
              ./mods/panopticon/main.js
              ./mods/panopticon/mod.json
              ./tests/install.sh
            ];
          };
        in
        {
          native-mod =
            pkgs.runCommand "panopticon-native-mod-check"
              {
                nativeBuildInputs = [
                  herdrChecker
                  pkgs.bash
                  pkgs.coreutils
                  pkgs.diffutils
                  pkgs.findutils
                  pkgs.gnugrep
                  pkgs.gnused
                ];
              }
              ''
                export HOME="$TMPDIR/home" XDG_CACHE_HOME="$TMPDIR/cache"
                mkdir -p "$HOME" "$XDG_CACHE_HOME"
                cp -R ${modSource} source
                chmod -R u+w source
                bash source/tests/check.sh
                touch "$out"
              '';

          installer =
            pkgs.runCommand "panopticon-installer-check"
              {
                nativeBuildInputs = with pkgs; [
                  bash
                  coreutils
                  diffutils
                  findutils
                  gnugrep
                  gnused
                ];
              }
              ''
                # The fixtures mutate their copy of the mod; store files are read-only.
                cp -R ${installerSource} source
                chmod -R u+w source
                bash source/tests/install.sh
                touch "$out"
              '';

          branding =
            pkgs.runCommand "panopticon-branding-check"
              {
                nativeBuildInputs = [
                  brandPython
                  pkgs.fontconfig.bin
                  pkgs.librsvg.out
                ];
                FONTCONFIG_FILE = brandFontsConf;
                PYTHONDONTWRITEBYTECODE = "1";
              }
              ''
                export XDG_CACHE_HOME="$TMPDIR/cache"
                mkdir -p "$XDG_CACHE_HOME/fontconfig"
                python ${brandSource}/branding/build.py --check
                python -m unittest discover -s ${brandSource}/branding -p 'test_*.py'
                touch "$out"
              '';

          shellcheck =
            pkgs.runCommand "panopticon-shellcheck"
              {
                nativeBuildInputs = [ pkgs.shellcheck ];
              }
              ''
                shellcheck ${./install.sh} ${./tests/check.sh} ${./tests/install.sh}
                touch "$out"
              '';
        }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
