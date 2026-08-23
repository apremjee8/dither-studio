import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { PRESETS, applyPreset } from "../src/presets";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "samples", "ridge-source.png");
const sourcePng = PNG.sync.read(readFileSync(sourcePath));
const source = {
  width: sourcePng.width,
  height: sourcePng.height,
  data: new Uint8ClampedArray(sourcePng.data),
};

for (const preset of PRESETS) {
  const out = applyPreset(source, preset.id);
  const png = new PNG({ width: out.width, height: out.height });
  png.data.set(out.data);
  const dest = join(root, "samples", `ridge-${preset.id}.png`);
  writeFileSync(dest, PNG.sync.write(png));
  console.log(dest, out.width, out.height);
}
