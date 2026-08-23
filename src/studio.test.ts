import { describe, expect, it } from "vitest";
import { buffersDiffer } from "./domain";
import { gradientBuffer } from "./fixtures";
import { emptyStudio, loadStudio, selectPreset } from "./studio";

describe("studio state", () => {
  it("starts empty", () => {
    expect(emptyStudio()).toEqual({ status: "empty" });
  });

  it("loads a buffer and applies the default preset", () => {
    const source = gradientBuffer(16, 12);
    const state = loadStudio({
      fileName: "lake.png",
      mime: "image/png",
      source,
    });
    if (state.status !== "ready") {
      throw new Error("expected ready");
    }
    expect(state.presetId).toBe("bitgrain");
    expect(state.output.width).toBe(16);
    expect(state.output.height).toBe(12);
    expect(buffersDiffer(state.source, state.output)).toBe(true);
  });

  it("recomputes output when the preset changes", () => {
    const source = gradientBuffer(16, 12);
    const loaded = loadStudio({
      fileName: "lake.png",
      mime: "image/png",
      source,
      presetId: "bitgrain",
    });
    const next = selectPreset(loaded, "cobalt");
    if (loaded.status !== "ready" || next.status !== "ready") {
      throw new Error("expected ready");
    }
    expect(next.presetId).toBe("cobalt");
    expect(buffersDiffer(loaded.output, next.output)).toBe(true);
    expect(next.source.data).toEqual(loaded.source.data);
  });
});
