# The Panopticon showcase

[Watch the film](https://github.com/user-attachments/assets/f749a976-a4f1-40b1-ab5c-716ec52f17d8) · [Poster](../media/panopticon-poster.jpg) · 32 seconds, 1080p/30. It works on mute; the MP4 also has an optional English walkthrough track.

The published demo was recorded before v0.2.0: it shows tool-first captions. The current mod leads with the existing tab name; the interactions and grid behavior are unchanged.

## Walkthrough

| Time | What happens |
| --- | --- |
| 0:00 | **Every agent. One grid.** Start in Atlas with Pi and a shell running tests in a split. |
| 0:06 | **Ctrl+Shift+G** reveals four agent terminals across Atlas, Beacon and Relay. The shell stays in its original pane. |
| 0:11 | **Needs you:** Beacon’s API review asks what an unknown stop should return. Type “Return an empty list.” into the tile. The status changes and the fallback test passes. |
| 0:19 | **Back to main** restores Atlas with the same split. |
| 0:23 | Reopen the grid and **click the Beacon caption**. The original API review pane still has the reply and test result. |

## Edit or render

Open `film.html` in a browser for a silent preview. The camera, titles, keycaps and interaction cues are in that file. `plates.webp` packs lossless captures from the actual mod running in a private Herdr Desktop 0.1.16 window: complete workspace and grid views, then small changed regions for typing, output and hover. The PTYs used scripted demo data, not anyone’s sessions. The focus pull, pointer and captions are editorial overlays.

The end-card mark and browser favicon use the [Bentham-inspired brand assets](../branding/README.md) in `media/brand/`. Rebuild those with `python branding/build.py` after changing the identity, then re-render the film. The already-published GitHub attachment does not change automatically.

`score.py` synthesizes the music and key sounds; `walkthrough.vtt` holds the text track. The [herdr-nvim showcase](https://github.com/ChmaraX/herdr-nvim) is the visual reference; no footage or audio from it is used.

To rebuild from the repository root, enter the pinned Nix shell with `nix develop` (or `direnv allow` for the checked-in `.envrc`), then run:

```sh
python presentation/render.py
```

The shell supplies Chromium, FFmpeg with libx264/AAC, Python with NumPy and Playwright, and Adwaita fonts through Fontconfig. No `pip install` or `playwright install` step is needed. Without Nix, provide Chromium and FFmpeg yourself and run `uv run --no-project --with numpy --with playwright python presentation/render.py`.

This uses Chromium on `PATH` (or pass `--browser /path/to/chrome`) and writes `media/panopticon.mp4` and `media/panopticon-poster.jpg`. For a single edit frame, add `--still 14.5 --out /tmp/panopticon-frame`. The edit uses Adwaita Sans and Adwaita Mono when available. No running Herdr, agent credentials, screen capture, or changes to the mod are needed to re-render.

The MP4 is published as a GitHub attachment rather than checked into Git. For a new cut, run `gh pr edit <number> --attach ./media/panopticon.mp4`, then copy the `user-attachments` URL from the PR body onto its own line in the README so GitHub displays the video player.
