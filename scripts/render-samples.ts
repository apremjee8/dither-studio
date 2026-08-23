import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { applyPreset } from "../src/presets";
import { SAMPLE_JOBS } from "../src/sample-jobs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const job of SAMPLE_JOBS) {
  const sourcePath = join(root, "samples", job.source);
  const sourcePng = PNG.sync.read(readFileSync(sourcePath));
  const source = {
    width: sourcePng.width,
    height: sourcePng.height,
    data: new Uint8ClampedArray(sourcePng.data),
  };

  for (const preset of job.presets) {
    const out = applyPreset(source, preset);
    const png = new PNG({ width: out.width, height: out.height });
    png.data.set(out.data);
    const dest = join(root, "samples", `${job.stem}-${preset}.png`);
    writeFileSync(dest, PNG.sync.write(png));
    console.log(dest, out.width, out.height);
  }
}
