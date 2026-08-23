import { describe, expect, it } from "vitest";
import { cellPx, downsampleSize, effectiveCell } from "./domain";
import { applyPrintSim } from "./print-sim";
import { presetById } from "./presets";
import { gradientBuffer } from "./fixtures";

describe("effectiveCell", () => {
  it("keeps the recipe cell on small buffers and scales up on large ones", () => {
    const cell = cellPx(2.4);
    expect(effectiveCell(cell, 48, 32)).toBe(2.4);
    expect(effectiveCell(cell, 1024, 1536)).toBeGreaterThan(2.4);
    expect(effectiveCell(cell, 1024, 1536)).toBeGreaterThan(1);
  });
});

describe("downsampleSize", () => {
  it("is a strict downsample for every shipped cell", () => {
    const cell = cellPx(2.4);
    const grid = downsampleSize(120, 80, cell);
    expect(grid.cols).toBe(50);
    expect(grid.rows).toBe(34);
    expect(grid.cols).toBeLessThan(120);
  });
});

describe("applyPrintSim", () => {
  it("returns a new buffer at the source size", () => {
    const source = gradientBuffer(24, 16);
    const out = applyPrintSim(source, presetById("cobalt"));
    expect(out).not.toBe(source);
    expect(out.data).not.toBe(source.data);
    expect(out.width).toBe(24);
    expect(out.height).toBe(16);
  });
});
