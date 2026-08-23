import {
  type DitherKind,
  type PaletteKind,
  type PixelBuffer,
  type Rgb,
  cloneBuffer,
  luminance,
} from "./domain";

const BAYER_4: readonly number[] = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

const BAYER_8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14,
  46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19,
  59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29,
  53, 21,
];

function clampByte(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return value;
}

function contrastValue(value: number, contrast: number): number {
  return clampByte((value / 255 - 0.5) * contrast * 255 + 128);
}

function readRgb(data: Uint8ClampedArray, index: number): Rgb {
  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
  };
}

function writeRgb(data: Uint8ClampedArray, index: number, rgb: Rgb): void {
  data[index] = rgb.r;
  data[index + 1] = rgb.g;
  data[index + 2] = rgb.b;
  data[index + 3] = 255;
}

function nearestColor(rgb: Rgb, colors: readonly Rgb[]): Rgb {
  const first = colors[0];
  if (!first) {
    return rgb;
  }
  let best = first;
  let bestDist = Infinity;
  for (const color of colors) {
    const dr = rgb.r - color.r;
    const dg = rgb.g - color.g;
    const db = rgb.b - color.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = color;
    }
  }
  return best;
}

function quantizeChannel(value: number, bits: number): number {
  const levels = 1 << bits;
  const step = 255 / (levels - 1);
  return clampByte(Math.round(value / step) * step);
}

function mapColor(rgb: Rgb, palette: PaletteKind): Rgb {
  if (palette.kind === "quantize") {
    return {
      r: quantizeChannel(rgb.r, palette.bitsPerChannel),
      g: quantizeChannel(rgb.g, palette.bitsPerChannel),
      b: quantizeChannel(rgb.b, palette.bitsPerChannel),
    };
  }
  return nearestColor(rgb, palette.colors);
}

function preparePixel(rgb: Rgb, contrast: number, grayscale: boolean): Rgb {
  const contrasted = {
    r: contrastValue(rgb.r, contrast),
    g: contrastValue(rgb.g, contrast),
    b: contrastValue(rgb.b, contrast),
  };
  if (!grayscale) {
    return contrasted;
  }
  const gray = luminance(contrasted);
  return { r: gray, g: gray, b: gray };
}

function bayerThreshold(x: number, y: number, size: 4 | 8): number {
  if (size === 4) {
    const value = BAYER_4[(y % 4) * 4 + (x % 4)] ?? 0;
    return (value + 0.5) / 16;
  }
  const value = BAYER_8[(y % 8) * 8 + (x % 8)] ?? 0;
  return (value + 0.5) / 64;
}

function addError(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  err: Rgb,
  factor: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = (y * width + x) * 4;
  data[index] = clampByte((data[index] ?? 0) + err.r * factor);
  data[index + 1] = clampByte((data[index + 1] ?? 0) + err.g * factor);
  data[index + 2] = clampByte((data[index + 2] ?? 0) + err.b * factor);
}

function floydSteinberg(
  buffer: PixelBuffer,
  contrast: number,
  grayscale: boolean,
  palette: PaletteKind,
): PixelBuffer {
  const out = cloneBuffer(buffer);
  const { width, height, data } = out;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const current = preparePixel(readRgb(data, index), contrast, grayscale);
      const chosen = mapColor(current, palette);
      writeRgb(data, index, chosen);
      const err = {
        r: current.r - chosen.r,
        g: current.g - chosen.g,
        b: current.b - chosen.b,
      };
      addError(data, width, height, x + 1, y, err, 7 / 16);
      addError(data, width, height, x - 1, y + 1, err, 3 / 16);
      addError(data, width, height, x, y + 1, err, 5 / 16);
      addError(data, width, height, x + 1, y + 1, err, 1 / 16);
    }
  }
  return out;
}

function orderedDither(
  buffer: PixelBuffer,
  contrast: number,
  grayscale: boolean,
  palette: PaletteKind,
  cell: number,
  size: 4 | 8,
): PixelBuffer {
  const out = cloneBuffer(buffer);
  const { width, height, data } = out;
  const spread = 255;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const current = preparePixel(readRgb(data, index), contrast, grayscale);
      const threshold = bayerThreshold(Math.floor(x / cell), Math.floor(y / cell), size);
      const offset = (threshold - 0.5) * spread;
      const probed = {
        r: clampByte(current.r + offset),
        g: clampByte(current.g + offset),
        b: clampByte(current.b + offset),
      };
      writeRgb(data, index, mapColor(probed, palette));
    }
  }
  return out;
}

export function ditherBuffer(input: {
  buffer: PixelBuffer;
  contrast: number;
  grayscale: boolean;
  dither: DitherKind;
  palette: PaletteKind;
}): PixelBuffer {
  const { buffer, contrast, grayscale, dither, palette } = input;
  if (dither.kind === "floyd-steinberg") {
    return floydSteinberg(buffer, contrast, grayscale, palette);
  }
  if (dither.kind === "bayer") {
    return orderedDither(buffer, contrast, grayscale, palette, 1, dither.size);
  }
  return orderedDither(buffer, contrast, grayscale, palette, dither.cell, 8);
}
