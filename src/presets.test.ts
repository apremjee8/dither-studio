import { describe, expect, it } from "vitest";
import { type PresetId, buffersDiffer, cellPx, downsampleSize } from "./domain";
import { gradientBuffer } from "./fixtures";
import { PRESETS, applyPreset, presetById } from "./presets";
import { applyPrintSim } from "./print-sim";

const SHIPPED_IDS: readonly PresetId[] = [
  "bitgrain",
  "cyanotype",
  "cobalt",
  "print-halftone",
  "denim",
  "meadow",
  "risograph",
  "paper-grain",
];

describe("print-sim recipes", () => {
  const source = gradientBuffer(48, 32);

  it("rejects a one-pixel cell", () => {
    expect(() => cellPx(1)).toThrow(/cell size must be > 1/);
  });

  it("downsamples every shipped preset to a coarse grid", () => {
    expect(new Set(PRESETS.map((preset) => preset.id))).toEqual(new Set(SHIPPED_IDS));
    expect(PRESETS).toHaveLength(SHIPPED_IDS.length);
    for (const preset of PRESETS) {
      expect(preset.cell).toBeGreaterThan(1);
      const grid = downsampleSize(48, 32, preset.cell);
      expect(grid.cols).toBeLessThan(48);
      expect(grid.rows).toBeLessThan(32);
    }
  });

  it("keeps source dimensions without mutating the source", () => {
    const before = new Uint8ClampedArray(source.data);
    for (const preset of PRESETS) {
      const out = applyPreset(source, preset.id);
      expect(out.width).toBe(source.width);
      expect(out.height).toBe(source.height);
    }
    expect(source.data).toEqual(before);
  });

  it.each(SHIPPED_IDS)("%s changes pixel data versus the source", (id) => {
    expect(buffersDiffer(source, applyPreset(source, id))).toBe(true);
  });

  it("uses the harbor ink and paper for cyanotype", () => {
    expect(presetById("cyanotype").look).toEqual({
      kind: "duo",
      ink: { r: 2, g: 92, b: 116 },
      paper: { r: 243, g: 248, b: 244 },
    });
  });

  it("uses the cobalt ink and paper for cobalt", () => {
    expect(presetById("cobalt").look).toEqual({
      kind: "duo",
      ink: { r: 49, g: 61, b: 235 },
      paper: { r: 248, g: 248, b: 252 },
    });
  });

  it("keeps Bitgrain and Print on the print-sim path", () => {
    expect(presetById("bitgrain").look.kind).toBe("bitgrain");
    expect(presetById("print-halftone").look.kind).toBe("print");
  });

  it.each(SHIPPED_IDS)("%s is deterministic", (id) => {
    expect(applyPreset(source, id).data).toEqual(applyPreset(source, id).data);
  });

  it("stamps one color per cell before intensity blend", () => {
    const recipe = { ...presetById("cyanotype"), blend: 0 };
    const out = applyPrintSim(source, recipe);
    expect(Array.from(out.data.slice(0, 3))).toEqual(Array.from(out.data.slice(4, 7)));
  });
});
