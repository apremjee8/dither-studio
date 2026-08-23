import { describe, expect, it } from "vitest";
import {
  buffersDiffer,
  cellPx,
  downsampleSize,
  rgbEqual,
  withBlend,
} from "./domain";
import { gradientBuffer } from "./fixtures";
import {
  COBALT_INK,
  COBALT_PAPER,
  CYANOTYPE_INK,
  CYANOTYPE_PAPER,
  PRESETS,
  applyPreset,
  presetById,
} from "./presets";
import { applyPrintSim } from "./print-sim";

const SHIPPED_IDS = [
  "bitgrain",
  "cyanotype",
  "cobalt",
  "print-halftone",
  "denim",
  "meadow",
  "risograph",
  "paper-grain",
] as const;

describe("print-sim recipes", () => {
  const source = gradientBuffer(48, 32);

  it("rejects a one-pixel cell", () => {
    expect(() => cellPx(1)).toThrow(/cell size must be > 1/);
    expect(() => cellPx(0)).toThrow(/cell size must be > 1/);
  });

  it("gives every shipped preset a cell larger than one pixel", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([...SHIPPED_IDS]);
    for (const preset of PRESETS) {
      expect(preset.cell).toBeGreaterThan(1);
      const grid = downsampleSize(48, 32, preset.cell);
      expect(grid.cols).toBeLessThan(48);
      expect(grid.rows).toBeLessThan(32);
    }
  });

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

  it.each(SHIPPED_IDS)("%s changes pixel data versus the source", (id) => {
    const out = applyPreset(source, id);
    expect(buffersDiffer(source, out)).toBe(true);
  });

  it("keeps the four launch looks on the print-sim path", () => {
    expect(presetById("bitgrain").look.kind).toBe("bitgrain");
    expect(presetById("cyanotype").look).toEqual({
      kind: "duo",
      ink: CYANOTYPE_INK,
      paper: CYANOTYPE_PAPER,
    });
    expect(presetById("cobalt").look).toEqual({
      kind: "duo",
      ink: COBALT_INK,
      paper: COBALT_PAPER,
    });
    expect(presetById("print-halftone").look.kind).toBe("print");
  });

  it("stamps one color per cell before intensity blend", () => {
    const recipe = withBlend(presetById("cyanotype"), 0);
    const out = applyPrintSim(source, recipe);
    const cell = recipe.cell;
    let x0 = 0;
    while (
      x0 + 1 < out.width &&
      Math.floor(x0 / cell) !== Math.floor((x0 + 1) / cell)
    ) {
      x0 += 1;
    }
    const x1 = x0 + 1;
    const y0 = 6;
    expect(Math.floor(x0 / cell)).toBe(Math.floor(x1 / cell));
    const a = (y0 * out.width + x0) * 4;
    const b = (y0 * out.width + x1) * 4;
    expect(
      rgbEqual(
        { r: out.data[a] ?? 0, g: out.data[a + 1] ?? 0, b: out.data[a + 2] ?? 0 },
        { r: out.data[b] ?? 0, g: out.data[b + 1] ?? 0, b: out.data[b + 2] ?? 0 },
      ),
    ).toBe(true);
  });
});
