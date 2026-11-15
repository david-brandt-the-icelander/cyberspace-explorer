# Cyberspace design

The design that [the Cyberspace spec](../cyberspace-mode-spec.md) implements. These are copies of the canvas [Cyberspace explorer in 3D](https://claude.ai/artifact/VDLEAr9k5mUna6aAPuC1Pp), taken on 2026-11-15, so that whoever builds or reviews Cyberspace can see the design without access to the canvas. The canvas is the source. Change the design there, then copy it here again.

## The Gibson look: artboards 11 to 15

On 2026-11-15 the owner chose a new look for Cyberspace, after the Gibson in *Hackers* (1995): always dark; cyan glass towers whose faces carry their own record; relationships as glowing circuit traces on a black, glossy floor, rising as arcs when their part is selected; the kind colour as an accent. Decision `space-gibson-look` in [.dev/decisions.json](../../.dev/decisions.json) records it (the owner accepted these artboards on 2026-11-15, after asking for thinner lines at the buildings' edges), the spec's *Rendering* says how it is drawn, and plan `cyberspace-gibson` in [.dev/plan.json](../../.dev/plan.json) builds it.

| Scene | Artboard | Render |
| --- | --- | --- |
| 11 · The component city, Loader selected | [Gibson-city.dc.html](Gibson-city.dc.html) | [gibson-city.webp](gibson-city.webp) |
| 12 · Walking toward Loader | [Gibson-street.dc.html](Gibson-street.dc.html) | [gibson-street.webp](gibson-street.webp) |
| 13 · The root folder's tower | [Gibson-tower.dc.html](Gibson-tower.dc.html) | [gibson-tower.webp](gibson-tower.webp) |
| 14 · The skyline of retro-games | [Gibson-skyline.dc.html](Gibson-skyline.dc.html) | [gibson-skyline.webp](gibson-skyline.webp) |
| 15 · A state machine, listing selected | [Gibson-state.dc.html](Gibson-state.dc.html) | [gibson-state.webp](gibson-state.webp) |

**What they are.** Each is a static page, 1440 × 900: an image of the scene under the page's HUD in HTML (the bar, the status line, the labels, the panels, the inspector, the map, the cards). The image is the scene drawn by a scratch prototype with three.js core alone, from frozen data, in the materials the spec gives: the sky sphere and the glossy floor, the glass shader with its faces' text, the trace ribbons, the glow lines, the reflections and the fog. Here the image is the file beside each artboard (`gibson-<scene>-scene.webp`); on the canvas it is an uploaded asset. The labels were placed by the spec's rules, projected with the same camera as the image.

**What they are drawn from.** This repository on 2026-11-15, read from GitHub by the page's own `load()`, `MODELS`, `layout()` and `cityWorld` (the component city has 5 plates, 28 towers, 6 beacons and 40 traces), and retro-games' 93 folders as the test fixture `test/fixtures/space/retro-folders.json` freezes them (commit a337ee5, 2026-11-12), placed by the page's own `skylineWorldFrom`, with the titles and purposes artboard 7 read on 2026-11-13. Every word on a face is the part's own, as the inspector shows it.

- **11** uses the spec's opening pose for the city, fitted to the room left by the Layers panel and the inspector.
- **12** is the scene the reference stills show, and the strongest of the five: the eye 1.7 above the floor in the avenue between Loader's rank and the next, 31 units up it, at (−0.75, 1.7, 10), looking down it to Loader at (−4.4, 4.5, −21.2), with Token store under the pointer. It is a place the reader walks to; **Walk to** arrives where the spec's *Scene 3* says.
- **13** uses the spec's tower pose, climbed 2.1 for the root's 26 floors.
- **14** uses the spec's skyline pose for retro-games (rings 20 apart, distance 125).
- **15** shows this repository's page state machine, top to bottom as Flat draws it at this size, with `listing` selected and its four triggers on its arcs.

The prototype also measured the look's cost; the numbers are in the spec's *Performance budgets* and in decision `space-gibson-look`.

## The first look: artboards 1 to 10

The scenes as they were designed on 2026-11-13 and built in steps 1 to 7. Their geometry, cameras and panels still hold where artboards 11 to 15 don't say otherwise; their colours are history. Artboards 4 to 6, light mode, are superseded: Cyberspace is always dark.

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

Each is a static page, 1440 × 900, that opens in any browser and loads the Barlow typefaces from Google Fonts; each render is its artboard drawn at that size. The owner accepted artboards 4 to 10 on 2026-11-13: decisions `space-light-mode` (4 to 6), `space-skyline` (7) and `space-other-kinds` (8 to 10).

- **All ten are drawn from the repositories.** Each part stands where the spec's `cityWorld`, `towerWorld` and `skylineWorld` put it, from the page's own models and dagre layout, projected with the spec's cameras and drawn as SVG in the first look's glass, beam and label styles.
- **They show the repositories as they were on 2026-11-13**, this one and retro-games. The root folder had 25 files, and the component diagram 4 plates, 23 towers, 5 beacons and 29 beams.
- **Artboards 1 to 3 are the dark twins of 4 to 6**: the same tower, city and street, drawn with the other block of the page's tokens. Only the hovered part differs between 3 and 6 (the GitHub adapter, the GitLab adapter).
- **Artboards 1 to 3 were first drawn by hand**, before the spec was checked against the code: an older component diagram with an invented *Loose parts* plate, a view from the front, one Layers row per kind. They were drawn again from the repository on 2026-11-14. The originals are in this folder's history.
