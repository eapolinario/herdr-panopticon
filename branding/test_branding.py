"""Structural and raster checks for the exported identity. No browser or Herdr needed."""

import math
import unittest
import xml.etree.ElementTree as ET

from PIL import Image

from build import CHALK, DEFAULT_OUT, GEOMETRY, INK, MINT, TEAL, number, polar, sector

SVG = "{http://www.w3.org/2000/svg}"
EXPORTS = {
    "icon.svg", "icon-dark.svg", "icon-mono.svg",
    "logo.svg", "logo-dark.svg", "logo-mono.svg",
    "app-icon.svg", "app-icon.png", "favicon.svg", "favicon.ico",
    "logo.png", "logo-dark.png", "preview.svg", "preview.png",
}


def part(root, name):
    return next(element for element in root.iter() if element.get("data-part") == name)


def rgba(hex_color):
    return (*bytes.fromhex(hex_color.removeprefix("#")), 255)


class GeometryTests(unittest.TestCase):
    def test_native_mod_is_the_geometry_source(self):
        self.assertEqual(GEOMETRY, {
            "size": 256, "center": 128, "cells": 8, "outer": 106, "inner": 73,
            "gap": 7, "panes": [99, 132], "paneSize": 25, "paneRadius": 5,
        })

    def test_cardinal_points_and_stable_rounding(self):
        self.assertEqual(polar(106, -90), (128, 22))
        self.assertEqual(number(-0.00001), "0")
        self.assertEqual(number(1.23456), "1.235")
        self.assertEqual(number(16), "16")

    def test_closed_sectors_and_positive_sightlines(self):
        for i in range(8):
            start, end = -90 + i * 45 + 3.5, -90 + (i + 1) * 45 - 3.5
            self.assertTrue(sector(start, end).endswith("Z"))
            self.assertEqual(end - start, 38)
        # Even the inner edge has a visible gap at the 32 px use size.
        self.assertGreater(2 * 73 * math.sin(math.radians(3.5)) / 8, 1)


class AssetTests(unittest.TestCase):
    def test_expected_exports(self):
        self.assertEqual({path.name for path in DEFAULT_OUT.iterdir()}, EXPORTS)

    def test_svg_accessibility_and_no_runtime_dependencies(self):
        for path in DEFAULT_OUT.glob("*.svg"):
            with self.subTest(asset=path.name):
                root = ET.parse(path).getroot()
                self.assertEqual(root.tag, SVG + "svg")
                self.assertEqual(root.get("role"), "img")
                self.assertTrue(root.find(SVG + "title").text)
                self.assertTrue(root.find(SVG + "desc").text)
                ids = [element.get("id") for element in root.iter() if element.get("id")]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertTrue(set(root.get("aria-labelledby").split()).issubset(ids))
                for element in root.iter():
                    self.assertNotIn(element.tag, {
                        SVG + "text", SVG + "image", SVG + "script", SVG + "foreignObject"
                    })
                    for key, value in element.attrib.items():
                        self.assertFalse(key.endswith("href"))
                        self.assertNotIn("url(", value)
                        self.assertNotIn("font-family", key)

    def test_primary_mark_geometry_and_theme_variants(self):
        for suffix, walls, tower in [
            ("", INK, TEAL), ("-dark", CHALK, MINT),
            ("-mono", "currentColor", "currentColor"),
        ]:
            root = ET.parse(DEFAULT_OUT / f"icon{suffix}.svg").getroot()
            cells, panes = part(root, "cells"), part(root, "tower")
            self.assertEqual(root.get("viewBox"), "0 0 256 256")
            self.assertEqual(cells.get("fill"), walls)
            self.assertEqual(panes.get("fill"), tower)
            self.assertEqual(len(cells), 8)
            self.assertEqual(len({cell.get("d") for cell in cells}), 8)
            self.assertEqual(len(panes), 4)
            self.assertEqual(
                {(pane.get("x"), pane.get("y")) for pane in panes},
                {("99", "99"), ("132", "99"), ("99", "132"), ("132", "132")},
            )

    def test_logo_bounds_and_shared_outlined_wordmark(self):
        roots = [ET.parse(DEFAULT_OUT / f"logo{suffix}.svg").getroot()
                 for suffix in ("", "-dark", "-mono")]
        self.assertEqual(len({root.get("viewBox") for root in roots}), 1)
        self.assertEqual(len({part(root, "wordmark").get("d") for root in roots}), 1)
        self.assertTrue(part(roots[0], "wordmark").get("d"))

    def test_png_sizes_and_transparency(self):
        logo = ET.parse(DEFAULT_OUT / "logo.svg").getroot()
        width, height = int(logo.get("width")), int(logo.get("height"))
        expected = {
            "app-icon.png": (512, 512), "preview.png": (1440, 1120),
            "logo.png": (width * 2, height * 2),
            "logo-dark.png": (width * 2, height * 2),
        }
        for name, size in expected.items():
            with Image.open(DEFAULT_OUT / name) as image:
                self.assertEqual(image.size, size)
                pixels = image.convert("RGBA")
                self.assertEqual(pixels.getpixel((0, 0))[3], 255 if name == "preview.png" else 0)

    def test_app_icon_grid_and_open_sightlines(self):
        with Image.open(DEFAULT_OUT / "app-icon.png") as image:
            pixels = image.convert("RGBA")
            for x in (227, 285):
                for y in (227, 285):
                    self.assertEqual(pixels.getpixel((x, y)), rgba(MINT))
            self.assertEqual(pixels.getpixel((256, 256)), rgba(INK))
            self.assertEqual(pixels.getpixel((256, 180)), rgba(INK))
            self.assertEqual(pixels.getpixel((256, 90)), rgba(INK))
            self.assertEqual(pixels.getpixel((316, 110)), rgba(CHALK))

    def test_optical_favicon_and_ico_sizes(self):
        root = ET.parse(DEFAULT_OUT / "favicon.svg").getroot()
        self.assertEqual(root.get("viewBox"), "0 0 16 16")
        self.assertEqual(len(part(root, "cells")), 8)
        self.assertEqual(len(part(root, "tower")), 1)
        with Image.open(DEFAULT_OUT / "favicon.ico") as image:
            self.assertEqual(image.ico.sizes(), {(16, 16), (32, 32), (48, 48)})
            for size in image.ico.sizes():
                frame = image.ico.getimage(size).convert("RGBA")
                self.assertEqual(frame.getpixel((size[0] // 2, size[1] // 2)), rgba(MINT))


if __name__ == "__main__":
    unittest.main()
