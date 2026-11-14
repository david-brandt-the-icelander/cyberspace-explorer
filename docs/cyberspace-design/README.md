# Cyberspace design

The design that [the Cyberspace spec](../cyberspace-mode-spec.md) implements. These are copies of the canvas [Cyberspace explorer in 3D](https://claude.ai/artifact/VDLEAr9k5mUna6aAPuC1Pp), taken on 2026-11-14, so that whoever builds or reviews Cyberspace can see the design without access to the canvas. The canvas is the source. Change the design there, then copy it here again.

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

- **All ten are drawn from the repositories.** Each part stands where the spec's `cityWorld`, `towerWorld` and `skylineWorld` put it, from the page's own models and dagre layout, projected with the spec's cameras and drawn in the spec's glass, beam and label styles. Nothing on them is invented, and the spec and they agree.
- **They show the repositories as they were on 2026-11-13**, this one and retro-games, like the numbers in the spec's acceptance checklist. The root folder had 25 files, and the component diagram 4 plates, 23 towers, 5 beacons and 29 beams. Step 1 of the build has since added Cyberspace's own parts to it (a fifth plate, a tower and a beacon), and every step adds more.
- **Artboards 1 to 3 are the dark twins of 4 to 6**: the same tower, city and street, drawn with the other block of the page's tokens. Only the hovered part differs between 3 and 6 (the GitHub adapter, the GitLab adapter), so that between them they show the hover card on each side of its tower.
- **Artboards 1 to 3 were first drawn by hand**, before the spec was checked against the code: an older component diagram with an invented *Loose parts* plate, a view from the front, one Layers row per kind. They were drawn again from the repository on 2026-11-14. The originals are in this folder's history.
