import { type PixelBuffer, type Preset, type PresetId, hexRgb } from "./domain";
import { ditherBuffer } from "./dither";

const TEAL = hexRgb("#0A4F54");
const CREAM = hexRgb("#F4F1E8");
const COBALT = hexRgb("#003DFF");
const WHITE = hexRgb("#FFFFFF");
const PINK = hexRgb("#FF3D8A");
const MINT = hexRgb("#2EE6A6");

const PRINT_PALETTE = [
  hexRgb("#F3EAD6"),
  hexRgb("#9EC5E8"),
  hexRgb("#4A7FB5"),
  hexRgb("#1E3A5F"),
  hexRgb("#B85C38"),
  hexRgb("#2C3A22"),
  hexRgb("#1A1A14"),
] as const;

export const PRESETS: readonly Preset[] = [
  {
    id: "bitgrain",
    name: "Bitgrain",
    blurb: "Fine error-diffusion that keeps the scene's color",
    contrast: 1.05,
    dither: { kind: "floyd-steinberg" },
    palette: { kind: "quantize", bitsPerChannel: 5 },
    grayscale: false,
  },
  {
    id: "cyanotype",
    name: "Cyanotype",
    blurb: "Teal and cream stipple",
    contrast: 1.35,
    dither: { kind: "floyd-steinberg" },
    palette: { kind: "fixed", colors: [TEAL, CREAM] },
    grayscale: true,
  },
  {
    id: "cobalt",
    name: "Cobalt",
    blurb: "Electric blue and white duotone",
    contrast: 1.3,
    dither: { kind: "floyd-steinberg" },
    palette: { kind: "fixed", colors: [COBALT, WHITE] },
    grayscale: true,
  },
  {
    id: "print-halftone",
    name: "Print",
    blurb: "Coarse screen-print grain",
    contrast: 1.15,
    dither: { kind: "halftone", cell: 5 },
    palette: { kind: "fixed", colors: PRINT_PALETTE },
    grayscale: false,
  },
  {
    id: "risograph",
    name: "Riso",
    blurb: "Pink and mint risograph",
    contrast: 1.25,
    dither: { kind: "floyd-steinberg" },
    palette: { kind: "fixed", colors: [PINK, MINT] },
    grayscale: true,
  },
  {
    id: "paper-grain",
    name: "Paper",
    blurb: "Ordered grain on the original color",
    contrast: 1.08,
    dither: { kind: "bayer", size: 8 },
    palette: { kind: "quantize", bitsPerChannel: 4 },
    grayscale: false,
  },
];

export const DEFAULT_PRESET_ID: PresetId = "bitgrain";

export function presetById(id: PresetId): Preset {
  const found = PRESETS.find((preset) => preset.id === id);
  if (!found) {
    const fallback = PRESETS[0];
    if (!fallback) {
      throw new Error("PRESETS is empty");
    }
    return fallback;
  }
  return found;
}

export function applyPreset(buffer: PixelBuffer, id: PresetId): PixelBuffer {
  const preset = presetById(id);
  return ditherBuffer({
    buffer,
    contrast: preset.contrast,
    grayscale: preset.grayscale,
    dither: preset.dither,
    palette: preset.palette,
  });
}

export const CYANOTYPE_COLORS = [TEAL, CREAM] as const;
export const COBALT_COLORS = [COBALT, WHITE] as const;
