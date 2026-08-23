import { describe, expect, it } from "vitest";
import { buffersDiffer, rgbEqual, uniqueRgbCount } from "./domain";
import { gradientBuffer } from "./fixtures";
import {
  COBALT_COLORS,
  CYANOTYPE_COLORS,
  applyPreset,
} from "./presets";

function everyPixelMatches(
  buffer: ReturnType<typeof applyPreset>,
  colors: readonly { r: number; g: number; b: number }[],
): boolean {
  const { data } = buffer;
  for (let i = 0; i < data.length; i += 4) {
    const pixel = { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 };
    if (!colors.some((color) => rgbEqual(color, pixel))) {
      return false;
    }
  }
  return true;
}

describe("applyPreset", () => {
  const source = gradientBuffer(48, 32);

  it("keeps source dimensions", () => {
    const out = applyPreset(source, "bitgrain");
    expect(out.width).toBe(source.width);
    expect(out.height).toBe(source.height);
  });

  it("does not mutate the source buffer", () => {
    const before = new Uint8ClampedArray(source.data);
    applyPreset(source, "print-halftone");
    expect(source.data).toEqual(before);
  });

  it.each(["bitgrain", "cyanotype", "cobalt", "print-halftone"] as const)(
    "%s changes pixel data versus the source",
    (id) => {
      const out = applyPreset(source, id);
      expect(buffersDiffer(source, out)).toBe(true);
    },
  );

  it("maps cyanotype to teal and cream only", () => {
    const out = applyPreset(source, "cyanotype");
    expect(everyPixelMatches(out, CYANOTYPE_COLORS)).toBe(true);
    expect(uniqueRgbCount(out)).toBe(2);
  });

  it("maps cobalt to electric blue and white only", () => {
    const out = applyPreset(source, "cobalt");
    expect(everyPixelMatches(out, COBALT_COLORS)).toBe(true);
    expect(uniqueRgbCount(out)).toBe(2);
  });

  it("keeps more unique colors in bitgrain than cyanotype", () => {
    const bitgrain = applyPreset(source, "bitgrain");
    const cyanotype = applyPreset(source, "cyanotype");
    expect(uniqueRgbCount(bitgrain)).toBeGreaterThan(uniqueRgbCount(cyanotype));
  });

  it("makes print/halftone blockier than bitgrain", () => {
    const print = applyPreset(source, "print-halftone");
    const grain = applyPreset(source, "bitgrain");
    expect(uniqueRgbCount(print)).toBeLessThan(uniqueRgbCount(grain));
  });
});
