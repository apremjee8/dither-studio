import {
  type NonEmptyRgb,
  type PixelBuffer,
  type Preset,
  type PresetId,
  type Rgb,
  cellPx,
} from "./domain";
import { applyPrintSim } from "./print-sim";

const CYANOTYPE_INK: Rgb = { r: 2, g: 92, b: 116 };
const CYANOTYPE_PAPER: Rgb = { r: 243, g: 248, b: 244 };
const COBALT_INK: Rgb = { r: 49, g: 61, b: 235 };
const COBALT_PAPER: Rgb = { r: 248, g: 248, b: 252 };
const DENIM_INK: Rgb = { r: 70, g: 121, b: 164 };
const DENIM_PAPER: Rgb = { r: 248, g: 249, b: 247 };
const MEADOW_INK: Rgb = { r: 25, g: 134, b: 32 };
const MEADOW_PAPER: Rgb = { r: 248, g: 250, b: 242 };

const PRINT_INKS: NonEmptyRgb = [
  { r: 243, g: 234, b: 214 },
  { r: 74, g: 127, b: 181 },
  { r: 30, g: 58, b: 95 },
  { r: 196, g: 163, b: 106 },
  { r: 59, g: 36, b: 22 },
  { r: 44, g: 58, b: 34 },
  { r: 26, g: 26, b: 20 },
];

const PRESET_TABLE = {
  bitgrain: {
    id: "bitgrain",
    name: "Bitgrain",
    blurb: "Block Bayer grain that keeps the scene",
    contrast: 1.08,
    cell: cellPx(1.8),
    kernel: "floyd-steinberg",
    noise: 4,
    bias: 0,
    blend: 0.65,
    look: { kind: "bitgrain", levelsPerChannel: 4 },
  },
  cyanotype: {
    id: "cyanotype",
    name: "Cyanotype",
    blurb: "Harbor ink on cool paper",
    contrast: 1.32,
    cell: cellPx(2.4),
    kernel: "simple",
    noise: 6,
    bias: 2,
    blend: 0.5,
    look: { kind: "duo", ink: CYANOTYPE_INK, paper: CYANOTYPE_PAPER },
  },
  cobalt: {
    id: "cobalt",
    name: "Cobalt",
    blurb: "Cobalt ink on cool paper",
    contrast: 1.28,
    cell: cellPx(2.2),
    kernel: "floyd-steinberg",
    noise: 7,
    bias: 4,
    blend: 0.55,
    look: { kind: "duo", ink: COBALT_INK, paper: COBALT_PAPER },
  },
  "print-halftone": {
    id: "print-halftone",
    name: "Print",
    blurb: "Chunky inks on cream paper",
    contrast: 1.18,
    cell: cellPx(3.2),
    kernel: "sierra",
    noise: 5,
    bias: 2,
    blend: 0.45,
    look: { kind: "print", inks: PRINT_INKS },
  },
  risograph: {
    id: "risograph",
    name: "Riso",
    blurb: "Pink and mint on coarse cells",
    contrast: 1.22,
    cell: cellPx(2.4),
    kernel: "atkinson",
    noise: 5,
    bias: 2,
    blend: 0.5,
    look: {
      kind: "duo",
      ink: { r: 226, g: 59, b: 122 },
      paper: { r: 126, g: 224, b: 176 },
    },
  },
  "paper-grain": {
    id: "paper-grain",
    name: "Paper",
    blurb: "Three-level Bayer on coarse cells",
    contrast: 1.08,
    cell: cellPx(2.1),
    kernel: "floyd-steinberg",
    noise: 3,
    bias: 0,
    blend: 0.6,
    look: { kind: "bitgrain", levelsPerChannel: 3 },
  },
  denim: {
    id: "denim",
    name: "Denim",
    blurb: "Steel blue on warm paper",
    contrast: 1.22,
    cell: cellPx(2.6),
    kernel: "floyd-steinberg",
    noise: 6,
    bias: 3,
    blend: 0.5,
    look: { kind: "duo", ink: DENIM_INK, paper: DENIM_PAPER },
  },
  meadow: {
    id: "meadow",
    name: "Meadow",
    blurb: "Leaf ink on warm paper",
    contrast: 1.2,
    cell: cellPx(2.5),
    kernel: "sierra",
    noise: 6,
    bias: 2,
    blend: 0.5,
    look: { kind: "duo", ink: MEADOW_INK, paper: MEADOW_PAPER },
  },
} satisfies Readonly<Record<PresetId, Preset>>;

export const PRESETS: readonly Preset[] = Object.values(PRESET_TABLE);

export const DEFAULT_PRESET_ID: PresetId = "bitgrain";

export function presetById(id: PresetId): Preset {
  return PRESET_TABLE[id];
}

export function applyPreset(buffer: PixelBuffer, id: PresetId): PixelBuffer {
  return applyPrintSim(buffer, presetById(id));
}
