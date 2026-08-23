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
| Bitgrain | Floyd–Steinberg error diffusion with 5-bit color. Keeps more of the original hue. |
| Cyanotype | Teal and cream stipple. High-contrast two-color Floyd–Steinberg. |
| Cobalt | Electric blue and white duotone. |
| Print | Coarse ordered halftone on a small print palette. |
| Riso | Pink and mint risograph. |
| Paper | Ordered Bayer grain with 4-bit color. |

Processing stays on the canvas. There is no model and no upload endpoint.

## Attach the repo to Vercel later

Do not deploy from this README. When you want a host, attach the GitHub repo in the Vercel dashboard as a Vite project.

1. Import `apremjee8/dither-studio`.
2. Leave the framework on Vite.
3. Use `npm run build` as the build command and `dist` as the output directory.
4. Set the install command to `npm install`.

Vite emits static files. No serverless function is required.
