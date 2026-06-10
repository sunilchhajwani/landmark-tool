# Landmark Tool

A generic, browser-based image coordinate calibrator. Drop any image, place landmarks (SVG points), calibrate to a real-world scale, and export — for use as ground-truth anatomy in clinical simulators, reference frames for measurements, or as input to any downstream rendering pipeline.

Single self-contained HTML file. No build step, no dependencies, no server required. Open `index.html` in any modern browser.

---

## Developed by Hermes Agent

This tool was designed and built by [Hermes Agent](https://hermes-agent.nousresearch.com/docs) (MiniMax-M3), a CLI AI agent developed by MiniMax. Hermes handles the full tool-design → build → iterate cycle for clinical reference and simulator-ground-truth workflows.

Author of the project: **Sunil C.** (intensivist, clinical-teaching content for PG residents).
Tool implementation: **Hermes Agent** (autonomous build under user direction).

---

## What it does

1. **Load any image** — drop a file or use the file picker. Works with PNG, JPG, SVG, GIF, WebP.
2. **Pick a starting preset** from the dropdown:
   - **Blank** — start from scratch
   - **Grid N×N (uniform)** — evenly-spaced 3×3, 5×5, 7×7, 10×10
   - **Adaptive N (centered)** — denser in image center, sparser at edges (5, 7, 9 levels)
   - **Examples** — built-in presets (currently: PLAX cardiac echo)
   - **Your saved presets** — anything you've previously saved
3. **Drag points to fine-tune** — every landmark is a draggable SVG circle. Right-click empty space to add, right-click an existing point to rename, change color, or delete.
4. **Calibrate scale** — click "Set scale", click two points a known real-world distance apart, enter the distance in cm. All coordinates then display in both pixels and cm.
5. **Save your layout as a preset** — coordinates are stored as fractions of image dimensions, so presets auto-adapt to any image size.
6. **Export** —
   - **JSON** — pure coordinates (for simulator consumption)
   - **SVG** — portable image+landmarks file (base64-embedded image)
   - **Preset file** — shareable preset JSON for use on other images

## Why generic

The tool has no domain knowledge. It doesn't know what a heart, lung, or chart looks like. It just places and tracks labeled points on any 2D image. PLAX (parasternal long axis echo) is shipped as a single example preset to demonstrate the workflow; you build the presets that match your actual content (echo views, X-rays, CT slices, waveforms, anatomy diagrams, charts, anything).

## Built-in presets

- **PLAX (normal) — example: cardiac echo** — 24 anatomical landmarks for a parasternal long axis view: aortic root + 3 AV cusps, mitral valve annulus + leaflet tips, LV apex + cavity + septum (basal/mid/apical) + posterior wall, LA center + walls, RVOT, descending aorta, pericardium.

You can delete this example if you don't need it.

## Use cases

- **Clinical simulator ground truth** — define the "correct" anatomy once, the simulator warps/deforms it for pathology presets
- **Measurement reference** — capture exact caliper positions on a real reference image for teaching
- **Anatomical labeling** — produce a labeled diagram from any reference image
- **Chart annotation** — define x/y anchor points on a graph for downstream code to read off values

## Keyboard / mouse

| Action | Result |
|---|---|
| Drag point | Reposition landmark |
| Right-click image | Add new landmark |
| Right-click landmark | Rename / change color / delete |
| Scroll wheel | Zoom in/out |
| Alt+drag | Pan |
| Click landmark in sidebar list | Select & highlight |
| Delete / Backspace (selected) | Remove landmark |
| Escape | Cancel calibration / deselect |

## Files

- `index.html` — entire tool (HTML + CSS + JS, ~1410 lines, ~58KB)

## License

MIT, do whatever you want with it.
