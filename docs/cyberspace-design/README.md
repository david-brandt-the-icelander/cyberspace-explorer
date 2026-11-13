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

Artboards 4 to 10 answer the open decisions `space-light-mode` (4 to 6), `space-skyline` (7) and `space-other-kinds` (8 to 10) in [.dev/decisions.json](../../.dev/decisions.json).

## What they show, and what they don't

- **Artboards 1 to 3 are drawn by hand.** The look, the panels, the type and the colours are the design. The positions are not: in the page, a city stands where `cityWorld` puts it, from the flat drawing's layout.
- **Artboards 4 to 10 are drawn from the repositories.** Each part stands where the spec's `cityWorld` and `towerWorld` put it, from the page's own models and dagre layout of this repository and of retro-games on 2026-11-13, projected with the spec's cameras where it gives one and drawn in the spec's glass, beam and label styles. Nothing on them is invented.
- **The city on artboard 2 is the component diagram as it was before 2026-11-13.** It shows 3 plates, 22 towers, 5 beacons and 23 beams. On 2026-11-13 the diagram has 4 plates (Landing page is one), 23 towers, 5 beacons and 29 beams, as artboards 5 and 10 show it. The *Loose parts* plate on artboard 2 is invented.
- **The tower on artboard 1 is the root folder's 24 files of 2026-11-13; artboard 4 has 25, with `plan.json`.** The root gains files as the work goes on.

Where the new artboards depart from the spec, on purpose:

- **Skyline (7).** The spec's rule, each subtree's angle in proportion to its number of folders on rings 14 units apart, puts 15 pairs of retro-games' buildings closer together than a building is wide (`.github` and `docs` get 4° each on the first ring, a unit of arc for a building 4.5 wide). The artboard gives each subtree the angle its own folders need, summed from the outermost ring in, and moves the rings apart until they fit: 20 units for retro-games. Every folder is the same 6 × 4.5 building, the address folder among them, selected; it is not drawn in full, since a full 16 × 12 tower and its drawer don't fit a 14-unit ring. The camera frames the address folder and lets the outer rings run to the horizon rather than fitting all 93 folders.
- **State machine (8).** Transitions that join the same two states fan out side by side (the spec's arcs would draw `opened`'s five transitions to and from `choosing` as one). The selected state's transitions show their triggers at their crests. A final state is ringed twice at its base and has a solid top: the spec's second band, 0.25 below the top, can't be told from the floor bands at city distance.
- **Use case (9).** A step's name is a whole sentence, so its label is its number and the start of its action, clipped at 150 px, behind a person or system icon; an alternative's label is its outcome, clipped, behind the branch icon.
- **Layers (8, 9).** A kind with several views (three state diagrams, six use cases) lists them under its row, and only the view in the address is ticked. Written and knowledge kinds are disabled, as the spec says; artboard 2 still shows them live.
- **A part that opens a folder (10).** The inspector shows the folder it opens as a block, with a miniature of its tower and **Enter its folder**, in place of the body's **Open worker** link, which in Cyberspace would leave for Flat.
- **The folder tower in light mode (4).** The drawer's city is scaled by 0.23, not 0.36: at 0.36 today's component city, 40.6 × 47.4 units, would stand 17.1 deep on a 12-deep floor. The folder card's chips name the four folders inside the root. The tower's top floor runs under the status line: the spec's fixed Scene 1 camera frames 24 floors, and the root now has 25.
