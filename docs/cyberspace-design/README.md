# Cyberspace design

The design that [the Cyberspace spec](../cyberspace-mode-spec.md) implements. These are copies of the canvas [Cyberspace explorer in 3D](https://claude.ai/artifact/VDLEAr9k5mUna6aAPuC1Pp), taken on 2026-11-13, so that whoever builds or reviews Cyberspace can see the design without access to the canvas. The canvas is the source. Change the design there, then copy it here again.

| Scene | Artboard | Render |
| --- | --- | --- |
| 1 · The folder as a tower of views | [Strata.dc.html](Strata.dc.html) | [strata.webp](strata.webp) |
| 2 · The component diagram as a city | [Main.dc.html](Main.dc.html) | [city.webp](city.webp) |
| 3 · Walking a district | [Street.dc.html](Street.dc.html) | [street.webp](street.webp) |

Each artboard is a static page, 1440 × 900, that opens in any browser and loads the Barlow typefaces from Google Fonts. Each render is its artboard drawn at that size.

## What they show, and what they don't

- **They are drawn by hand, not by the page.** The look, the panels, the type and the colours are the design. The positions are not: in the page, a city stands where `cityWorld` puts it, from the flat drawing's layout.
- **The city is the component diagram as it was before 2026-11-13.** It shows 3 plates, 22 towers, 5 beacons and 23 beams. On 2026-11-13 the diagram has 4 plates (Landing page is one), 23 towers, 5 beacons and 29 beams. The *Loose parts* plate on the city artboard is invented.
- **The tower is the root folder's 24 files of 2026-11-13.** The root gains files as the work goes on.
- **There is no light mode, no repository with several folders, and no city other than a component diagram.** The spec gives defaults for each, and the open questions about them are decisions in [.dev/decisions.json](../../.dev/decisions.json).
