{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  libxcb,
  libxkbcommon,
}:
let
  target = if stdenv.hostPlatform.isAarch64 then "linux-aarch64" else "linux-x86_64";
  hashes = {
    x86_64-linux = "sha256-KC0mMhlrI4IGz+Zr+2HA+vKZyhyRhDvQdlIbvjZXEhY=";
    aarch64-linux = "sha256-7+708XWbDokA8gXCwisUKHoRL4dEBlObTqGzviS3NjE=";
  };
in
stdenv.mkDerivation {
  pname = "herdr-app-checker";
  version = "0.1.16";
  # Official release manifest hashes. Used only by tests, never installed globally.
  src = fetchurl {
    url = "https://releases.herdr.dev/app/0.1.16/herdr-app-${target}.tar.gz";
    hash = hashes.${stdenv.hostPlatform.system};
  };
  sourceRoot = "herdr-app";
  strictDeps = true;
  nativeBuildInputs = [ autoPatchelfHook ];
  buildInputs = [
    libxcb
    libxkbcommon
    stdenv.cc.cc.lib
  ];
  dontConfigure = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    install -Dm755 herdr-app "$out/bin/herdr-app"
    install -Dm644 LICENSE "$out/share/doc/herdr-app-checker/LICENSE"
    install -Dm644 THIRD-PARTY-NOTICES "$out/share/doc/herdr-app-checker/THIRD-PARTY-NOTICES"
    runHook postInstall
  '';
  meta = {
    description = "Pinned Herdr API checker for Panopticon's isolated tests";
    homepage = "https://herdr.dev";
    license = lib.licenses.asl20;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
    mainProgram = "herdr-app";
  };
}
