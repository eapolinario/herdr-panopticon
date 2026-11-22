"""Build Panopticon's font-independent SVG and PNG identity assets.

Run inside the Nix shell: python branding/build.py [--check]
The geometry is an abstraction of Bentham's circular plan, not a reconstruction.
"""

import argparse
import io
import json
import math
import re
import subprocess
import tempfile
from html import escape
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "media" / "brand"
INK = "#111d23"
PAPER = "#f3f1e9"
CHALK = "#e9eee9"
MINT = "#abefdc"
TEAL = "#286e5b"
MUTED = "#91aaa9"
RULE = "#d6d9ce"


def load_geometry():
    """Read data, not executable JS: the mod stays a standalone two-file install."""
    source = (ROOT / "mods" / "panopticon" / "main.js").read_text(encoding="utf-8")
    match = re.search(
        r"export const BRAND_GEOMETRY = Object\.freeze\((\{.*?\})\);", source, re.S
    )
    if not match:
        raise RuntimeError("Missing JSON-compatible BRAND_GEOMETRY in mods/panopticon/main.js")
    return json.loads(match.group(1))


GEOMETRY = load_geometry()


def number(value):
    """Stable, compact coordinates, with no negative zero."""
    if abs(value) < 0.0005:
        return "0"
    return f"{value:.3f}".rstrip("0").rstrip(".")


def font_path(family):
    result = subprocess.check_output(
        ["fc-match", "-f", "%{family}\n%{file}", family], text=True
    ).splitlines()
    if len(result) != 2 or family not in result[0].split(","):
        raise RuntimeError(f"{family} is missing; enter the Nix shell first")
    return Path(result[1])


class Outliner:
    """Shape with HarfBuzz, then outline the same font instance with FontTools."""

    def __init__(self, family, variations=None):
        raw = font_path(family).read_bytes()
        font = TTFont(io.BytesIO(raw))
        if variations:
            font = instantiateVariableFont(font, variations, inplace=True)
        self.glyphs = font.getGlyphSet()
        self.order = font.getGlyphOrder()
        self.upem = font["head"].unitsPerEm
        self.shaper = hb.Font(hb.Face(raw))
        self.shaper.scale = (self.upem, self.upem)
        hb.ot_font_set_funcs(self.shaper)
        if variations:
            self.shaper.set_variations(variations)

    def outline(self, text, size, tracking=0):
        buffer = hb.Buffer()
        buffer.add_str(text)
        buffer.guess_segment_properties()
        hb.shape(self.shaper, buffer, {"kern": True, "liga": False})
        scale = size / self.upem
        pen = SVGPathPen(self.glyphs, ntos=number)
        bounds = BoundsPen(self.glyphs)
        cursor = 0
        for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
            transform = (
                scale, 0, 0, -scale,
                cursor + position.x_offset * scale,
                -position.y_offset * scale,
            )
            glyph = self.glyphs[self.order[info.codepoint]]
            glyph.draw(TransformPen(pen, transform))
            glyph.draw(TransformPen(bounds, transform))
            cursor += position.x_advance * scale + tracking
        return pen.getCommands(), cursor - tracking, bounds.bounds

    def text(self, text, x, baseline, size, fill, tracking=0, anchor="start", part=None):
        path, advance, _ = self.outline(text, size, tracking)
        if anchor == "middle":
            x -= advance / 2
        elif anchor == "end":
            x -= advance
        attribute = f' data-part="{part}"' if part else ""
        return (
            f'<path{attribute} fill="{fill}" transform="translate({number(x)} '
            f'{number(baseline)})" d="{path}"/>'
        )


def polar(radius, angle, center=GEOMETRY["center"]):
    angle = math.radians(angle)
    return center + radius * math.cos(angle), center + radius * math.sin(angle)


def sector(start, end, outer=GEOMETRY["outer"], inner=GEOMETRY["inner"], center=GEOMETRY["center"]):
    a, b = polar(outer, start, center), polar(outer, end, center)
    c, d = polar(inner, end, center), polar(inner, start, center)
    return (
        f"M{number(a[0])} {number(a[1])}"
        f"A{outer} {outer} 0 0 1 {number(b[0])} {number(b[1])}"
        f"L{number(c[0])} {number(c[1])}"
        f"A{inner} {inner} 0 0 0 {number(d[0])} {number(d[1])}Z"
    )


def mark(walls=INK, tower=TEAL, small=False):
    """Eight separated cells; four terminal panes in the central inspection house."""
    if small:
        # Optical 16 px master: wider sightlines and a single solid viewpoint.
        outer, inner, center, gap = 6.25, 4.35, 8, 12
    else:
        outer, inner, center, gap = (GEOMETRY[key] for key in ("outer", "inner", "center", "gap"))
    cells = []
    step = 360 / GEOMETRY["cells"]
    for i in range(GEOMETRY["cells"]):
        start = -90 + i * step + gap / 2
        end = -90 + (i + 1) * step - gap / 2
        cells.append(f'<path d="{sector(start, end, outer, inner, center)}"/>')
    if small:
        panes = '<rect x="6" y="6" width="4" height="4" rx="1"/>'
    else:
        size, radius = GEOMETRY["paneSize"], GEOMETRY["paneRadius"]
        panes = "".join(
            f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{radius}"/>'
            for y in GEOMETRY["panes"] for x in GEOMETRY["panes"]
        )
    return (
        f'<g data-part="cells" fill="{walls}">{"".join(cells)}</g>\n'
        f'<g data-part="tower" fill="{tower}">{panes}</g>'
    )


def group(content, x, y, scale=1):
    return (
        f'<g transform="translate({number(x)} {number(y)}) scale({number(scale)})">'
        f"{content}</g>"
    )


def svg(width, height, title, description, content):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">\n'
        f'<title id="title">{escape(title)}</title>\n'
        f'<desc id="desc">{escape(description)}</desc>\n'
        f'{content}\n</svg>\n'
    )


def rect(x, y, width, height, fill, radius=0):
    return (
        f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
        f'rx="{radius}" fill="{fill}"/>'
    )


def app_icon():
    return (
        rect(0, 0, 512, 512, INK, 112)
        + '<rect x="1" y="1" width="510" height="510" rx="111" '
        'fill="none" stroke="#2b424c" stroke-width="2"/>'
        + group(mark(CHALK, MINT), 32, 32, 1.75)
    )


def identity_sheet(label, body, logo, logo_width):
    """An editorial proof sheet: both backgrounds, app tile, mono and actual sizes."""
    elements = [rect(0, 0, 1440, 1120, PAPER), rect(0, 0, 1440, 560, INK)]
    elements += [
        label.text("PANOPTICON / IDENTITY 01", 64, 63, 15, MUTED, 1.8),
        label.text("HERDR DESKTOP", 1376, 63, 15, MUTED, 1.8, "end"),
        rect(64, 95, 1312, 1, "#2b424c"),
        group(logo(CHALK, MINT), 64, 179, 1312 / logo_width),
        body.text("Every agent. One grid.", 720, 466, 36, MINT, -0.5, "middle"),
        label.text(
            "BENTHAM'S CIRCULAR PLAN / RECAST AS LIVE TERMINALS",
            720, 515, 12, MUTED, 1.6, "middle"
        ),
        label.text("01 / LIGHT BACKGROUND", 64, 625, 13, TEAL, 1.1),
        group(logo(INK, TEAL), 48, 702, 688 / logo_width),
        label.text("02 / APP ICON", 838, 625, 13, TEAL, 1.1),
        group(app_icon(), 838, 679, 188 / 512),
        label.text("03 / ONE COLOUR", 1112, 625, 13, TEAL, 1.1),
        group(mark(INK, INK), 1098, 674, 200 / 256),
        rect(64, 912, 688, 1, RULE),
        label.text("PALETTE", 64, 946, 12, TEAL, 1.1),
        label.text("SMALL-SIZE PROOF / ACTUAL PIXELS", 838, 946, 12, TEAL, 0.7),
    ]
    for i, (name, color) in enumerate([
        ("INK", INK), ("PAPER", PAPER), ("MINT", MINT), ("TEAL", TEAL)
    ]):
        x = 64 + i * 174
        elements += [
            rect(x, 965, 152, 36, RULE, 3),
            rect(x + 1, 966, 150, 34, color, 2),
            label.text(f"{name} / {color.upper()}", x, 1025, 10, INK, 0.2),
        ]
    for i, size in enumerate((16, 24, 32, 48, 64)):
        x = 838 + i * 108
        elements.append(
            group(mark(INK, INK, small=True), x, 970, 1)
            if size == 16 else group(mark(INK, TEAL), x, 970, size / 256)
        )
        elements.append(label.text(str(size), x, 1047, 12, INK))
    elements += [
        rect(64, 1071, 1312, 1, RULE),
        label.text("EIGHT CELLS. ONE CENTRAL VIEWPOINT.", 64, 1101, 11, TEAL, 0.7),
        label.text("SVG / OUTLINED TYPE / NO EXTERNAL ASSETS", 1376, 1101, 11, TEAL, 0.7, "end"),
    ]
    return svg(
        1440, 1120, "Panopticon identity sheet",
        "Dark and light logos, app icon, monochrome mark, palette and small-size proof. "
        "Eight radial cells refer to Jeremy Bentham's Panopticon; four central panes "
        "refer to the live terminal grid.",
        "\n".join(elements),
    )


def render_png(source, destination, width=None):
    command = ["rsvg-convert", str(source)]
    if width:
        command += ["--width", str(width)]
    raw = subprocess.check_output(command)
    with Image.open(io.BytesIO(raw)) as image:
        image.save(destination, optimize=True, compress_level=9)


def build(out):
    out.mkdir(parents=True, exist_ok=True)
    wordmark = Outliner("Adwaita Sans", {"wght": 620, "opsz": 32})
    body = Outliner("Adwaita Sans", {"wght": 400, "opsz": 32})
    label = Outliner("Adwaita Mono")
    word_path, advance, bounds = wordmark.outline("panopticon", 132, -1.5)
    # Place visible contours, not the font's line box, on the icon's centerline.
    baseline = 112 - (bounds[1] + bounds[3]) / 2
    logo_width = math.ceil(232 + advance + 24)
    logo_height = 224

    def logo(walls, tower):
        return (
            group(mark(walls, tower), 16, 16, 0.75)
            + f'<path data-part="wordmark" fill="{walls}" '
            f'transform="translate(232 {number(baseline)})" d="{word_path}"/>'
        )

    description = (
        "Eight radial cells around a four-pane central observation point, "
        "inspired by Jeremy Bentham's Panopticon plan and Panopticon's live agent grid."
    )
    assets = {}
    for suffix, walls, tower in [
        ("", INK, TEAL), ("-dark", CHALK, MINT),
        ("-mono", "currentColor", "currentColor"),
    ]:
        variant = {"": "light-background", "-dark": "dark-background", "-mono": "monochrome"}[suffix]
        assets[f"icon{suffix}.svg"] = svg(
            GEOMETRY["size"], GEOMETRY["size"], f"Panopticon icon — {variant}", description, mark(walls, tower)
        )
        assets[f"logo{suffix}.svg"] = svg(
            logo_width, logo_height, f"Panopticon logo — {variant}",
            description + " Lowercase Panopticon wordmark, converted to vector outlines.",
            logo(walls, tower),
        )
    assets["app-icon.svg"] = svg(
        512, 512, "Panopticon app icon", description, app_icon()
    )
    assets["favicon.svg"] = svg(
        16, 16, "Panopticon favicon",
        "An optically simplified circular plan with a solid central viewpoint for small sizes.",
        rect(0, 0, 16, 16, INK, 3.5) + mark(CHALK, MINT, small=True),
    )
    assets["preview.svg"] = identity_sheet(label, body, logo, logo_width)
    for name, content in assets.items():
        (out / name).write_text(content, encoding="utf-8")
    for name, width in [("app-icon", 512), ("logo", logo_width * 2),
                        ("logo-dark", logo_width * 2), ("preview", 1440)]:
        render_png(out / f"{name}.svg", out / f"{name}.png", width)
    # Render each optical size separately rather than downsampling one large icon.
    frames = []
    for size in (16, 32, 48):
        raw = subprocess.check_output(
            ["rsvg-convert", str(out / "favicon.svg"), "--width", str(size)]
        )
        with Image.open(io.BytesIO(raw)) as image:
            frames.append(image.convert("RGBA"))
    frames[-1].save(
        out / "favicon.ico", sizes=[frame.size for frame in frames],
        append_images=frames[:-1], bitmap_format="bmp",
    )
    return sorted([*assets, "app-icon.png", "logo.png", "logo-dark.png", "preview.png", "favicon.ico"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true", help="verify the checked-in exports without modifying them")
    args = parser.parse_args()
    if args.check:
        with tempfile.TemporaryDirectory(prefix="panopticon-brand-check-") as temp:
            generated = Path(temp)
            names = build(generated)
            mismatches = [
                name for name in names
                if not (args.out / name).is_file()
                or (args.out / name).read_bytes() != (generated / name).read_bytes()
            ]
            if mismatches:
                parser.exit(1, "Outdated or missing branding assets: " + ", ".join(mismatches) + "\n")
        print(f"Branding exports match ({len(names)} files).")
    else:
        names = build(args.out)
        print(f"Wrote {len(names)} assets to {args.out}")


if __name__ == "__main__":
    main()
