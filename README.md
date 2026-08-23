# Dither Studio

Local-first photo dithering in one tab. A file you pick is decoded on a canvas, remapped by a preset, and written back out as a PNG. Image bytes are not sent to a server.

## Run it

You need Node 20 or newer.

```bash
npm install
npx playwright install chromium
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. Use **Upload** or drop a JPG, PNG, or WebP on the sheet. Pick a preset in the dock. Use **Download PNG** for a full-resolution file. The download uses the source width and height, not the size of the preview on screen.

```bash
npm test
```

That command runs the unit tests, then Playwright against the Vite dev server.

## Presets

| Preset | What it does |
| --- | --- |
| Bitgrain | Coarse Bayer cells, 4 levels per channel, then intensity blend. |
| Cyanotype | Harbor ink `[2,92,116]` on cool paper. Simple kernel on a coarse grid. |
| Cobalt | Cobalt ink `[49,61,235]` on cool paper. Floyd-Steinberg on the grid. |
| Print | Chunkier cells and a small ink set, then intensity blend. |
| Denim | Steel blue on warm paper. Midtones for rock and sky. |
| Meadow | Leaf ink on warm paper. |
| Riso | Pink and mint on the same coarse-cell path. |
| Paper | Three-level Bayer on coarse cells. |

Each look crushes the photo to cells larger than one pixel, error-diffuses or Bayer-quantizes that grid, stamps one color per cell, then pulls luminance back toward the source so the photo still reads. Image bytes stay in the tab.

`npm run samples` reads `SAMPLE_JOBS` in `src/sample-jobs.ts` and writes `samples/<stem>-<preset>.png`. Ridge stays. Midtone town, grass, and sky use a subset of presets. If those still miss the look, next is slider defaults for detail, contrast, and blend. Do not start another engine.

Processing stays on the canvas. There is no model and no upload endpoint.

## Attach the repo to Vercel later

Do not deploy from this README. When you want a host, attach the GitHub repo in the Vercel dashboard as a Vite project.

1. Import `apremjee8/dither-studio`.
2. Leave the framework on Vite.
3. Use `npm run build` as the build command and `dist` as the output directory.
4. Set the install command to `npm install`.

Vite emits static files. No serverless function is required.
