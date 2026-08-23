import { type PresetId } from "./domain";
import { PRESETS } from "./presets";

export type SampleJob = {
  readonly source: string;
  readonly stem: string;
  readonly presets: readonly PresetId[];
};

export const SAMPLE_JOBS: readonly SampleJob[] = [
  {
    source: "ridge-source.png",
    stem: "ridge",
    presets: PRESETS.map((preset) => preset.id),
  },
  {
    source: "midtone-town.png",
    stem: "midtone-town",
    presets: ["print-halftone", "bitgrain", "denim"],
  },
  {
    source: "midtone-grass.png",
    stem: "midtone-grass",
    presets: ["cyanotype", "meadow"],
  },
  {
    source: "midtone-sky.png",
    stem: "midtone-sky",
    presets: ["cobalt", "bitgrain"],
  },
];
