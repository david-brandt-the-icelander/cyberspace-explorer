# Cyberspace design

The design that [the Cyberspace spec](../cyberspace-mode-spec.md) implements. These are copies of the canvas [Cyberspace explorer in 3D](https://claude.ai/artifact/VDLEAr9k5mUna6aAPuC1Pp), taken on 2026-11-13, so that whoever builds or reviews Cyberspace can see the design without access to the canvas. The canvas is the source. Change the design there, then copy it here again.

| Scene | Artboard | Render |
| --- | --- | --- |
| 1 · The folder as a tower of views | [Strata.dc.html](Strata.dc.html) | [strata.webp](strata.webp) |
| 2 · The component diagram as a city | [Main.dc.html](Main.dc.html) | [city.webp](city.webp) |
| 3 · Walking a district | [Street.dc.html](Street.dc.html) | [street.webp](street.webp) |
| 4 · The folder tower in light mode | [StrataLight.dc.html](StrataLight.dc.html) | [strata-light.webp](strata-light.webp) |
| 5 · The component city in light mode | [MainLight.dc.html](MainLight.dc.html) | [city-light.webp](city-light.webp) |
| 6 · Walking a district in light mode | [StreetLight.dc.html](StreetLight.dc.html) | [street-light.webp](street-light.webp) |
| 7 · Several folders: the skyline of retro-games | [Skyline.dc.html](Skyline.dc.html) | [skyline.webp](skyline.webp) |
| 8 · A state machine as a city | [StateCity.dc.html](StateCity.dc.html) | [state-city.webp](state-city.webp) |
| 9 · A use case as a city | [UseCaseCity.dc.html](UseCaseCity.dc.html) | [use-case-city.webp](use-case-city.webp) |
| 10 · A part that opens a folder | [Worker.dc.html](Worker.dc.html) | [worker.webp](worker.webp) |

Each artboard is a static page, 1440 × 900, that opens in any browser and loads the Barlow typefaces from Google Fonts. Each render is its artboard drawn at that size.

The owner accepted artboards 4 to 10 on 2026-11-13: decisions `space-light-mode` (4 to 6), `space-skyline` (7) and `space-other-kinds` (8 to 10) in [.dev/decisions.json](../../.dev/decisions.json). The spec follows them.

## What they show, and what they don't

- **Artboards 1 to 3 are drawn by hand.** The look, the panels, the type and the colours are the design. The positions are not: in the page, a city stands where `cityWorld` puts it, from the flat drawing's layout.
- **Artboards 4 to 10 are drawn from the repositories.** Each part stands where the spec's `cityWorld`, `towerWorld` and `skylineWorld` put it, from the page's own models and dagre layout of this repository and of retro-games on 2026-11-13, projected with the spec's cameras and drawn in the spec's glass, beam and label styles. Nothing on them is invented, and the spec and they agree.
- **The spec no longer follows artboards 1 to 3 in these things**, which artboards 4 to 10 show as the spec has them:
  - The city on artboard 2 is the component diagram as it was before 2026-11-13: 3 plates, 22 towers, 5 beacons and 23 beams, with an invented *Loose parts* plate. It now has 4 plates (Landing page is one), 23 towers, 5 beacons and 29 beams (artboards 5 and 10).
  - Artboard 2 looks at its city from the front (−4.4°). The page looks from the front left (−40°), where towers cover each other least.
  - Artboard 2's Layers panel has one row per kind, ticks Deployment without standing it, and shows the written kinds live. The panel has a row for each view of a kind with several, and the written kinds are disabled (artboards 8 and 9).
  - Artboard 1 is the root folder's 24 files; it has 25 with `plan.json`, and gains more as the work goes on. Its knowledge floors are not in the page's order. Its folder card says *No folders inside it*, but the root has four, and the pulled-floor card sits under a folder card that has grown (artboard 4).
  - Artboard 3's hover card lists its part's beams by name and overlaps the map. The card gives their number and keeps clear of the panels (artboard 6).
