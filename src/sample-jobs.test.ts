import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { SAMPLE_JOBS } from "./sample-jobs";

const samplesDir = join(process.cwd(), "samples");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function destName(stem: string, preset: string): string {
  return `${stem}-${preset}.png`;
}

describe("sample jobs", () => {
  it("has every source under samples/", () => {
    for (const job of SAMPLE_JOBS) {
      expect(existsSync(join(samplesDir, job.source)), job.source).toBe(true);
    }
  });

  it("names every output ${stem}-${preset}.png", () => {
    const dests = SAMPLE_JOBS.flatMap((job) =>
      job.presets.map((preset) => destName(job.stem, preset)),
    );
    expect(dests).toEqual([
      ...PRESETS.map((preset) => `ridge-${preset.id}.png`),
      "midtone-town-print-halftone.png",
      "midtone-town-bitgrain.png",
      "midtone-town-denim.png",
      "midtone-grass-cyanotype.png",
      "midtone-grass-meadow.png",
      "midtone-sky-cobalt.png",
      "midtone-sky-bitgrain.png",
    ]);
  });

  it("writes PNGs at the source size", () => {
    for (const job of SAMPLE_JOBS) {
      const sourceBytes = readFileSync(join(samplesDir, job.source));
      const sourcePng = PNG.sync.read(sourceBytes);
      for (const preset of job.presets) {
        const dest = destName(job.stem, preset);
        const path = join(samplesDir, dest);
        expect(existsSync(path), dest).toBe(true);
        const bytes = readFileSync(path);
        expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
        const outPng = PNG.sync.read(bytes);
        expect(outPng.width, dest).toBe(sourcePng.width);
        expect(outPng.height, dest).toBe(sourcePng.height);
      }
    }
  });
});
