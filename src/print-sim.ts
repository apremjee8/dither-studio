import {
  type CellPx,
  type KernelId,
  type Look,
  type NonEmptyRgb,
  type PixelBuffer,
  type PrintRecipe,
  type Rgb,
  cloneBuffer,
  downsampleSize,
  effectiveCell,
  luminance,
} from "./domain";

const BAYER_8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14,
  46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19,
  59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29,
  53, 21,
];

type Tap = { readonly dx: number; readonly dy: number; readonly weight: number };

const KERNELS: Record<KernelId, readonly Tap[]> = {
  "floyd-steinberg": [
    { dx: 1, dy: 0, weight: 7 / 16 },
    { dx: -1, dy: 1, weight: 3 / 16 },
    { dx: 0, dy: 1, weight: 5 / 16 },
    { dx: 1, dy: 1, weight: 1 / 16 },
  ],
  atkinson: [
    { dx: 1, dy: 0, weight: 1 / 8 },
    { dx: 2, dy: 0, weight: 1 / 8 },
    { dx: -1, dy: 1, weight: 1 / 8 },
    { dx: 0, dy: 1, weight: 1 / 8 },
    { dx: 1, dy: 1, weight: 1 / 8 },
    { dx: 0, dy: 2, weight: 1 / 8 },
  ],
  sierra: [
    { dx: 1, dy: 0, weight: 2 / 4 },
    { dx: -1, dy: 1, weight: 1 / 4 },
    { dx: 0, dy: 1, weight: 1 / 4 },
  ],
  simple: [
    { dx: 1, dy: 0, weight: 1 / 2 },
    { dx: 0, dy: 1, weight: 1 / 2 },
  ],
};

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

function contrastBuffer(buffer: PixelBuffer, contrast: number): PixelBuffer {
  const out = cloneBuffer(buffer);
  const data = out.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = contrastValue(data[i] ?? 0, contrast);
    data[i + 1] = contrastValue(data[i + 1] ?? 0, contrast);
    data[i + 2] = contrastValue(data[i + 2] ?? 0, contrast);
  }
  return out;
}

function cellBounds(index: number, count: number, limit: number, cell: CellPx): {
  start: number;
  end: number;
} {
  return {
    start: Math.floor(index * cell),
    end: index === count - 1 ? limit : Math.floor((index + 1) * cell),
  };
}

function hashUnit(x: number, y: number, salt: number): number {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967296;
}

function noiseDelta(x: number, y: number, salt: number, amplitude: number): number {
  return (hashUnit(x, y, salt) * 2 - 1) * amplitude;
}

type Grid = {
  readonly cols: number;
  readonly rows: number;
  readonly r: Float64Array;
  readonly g: Float64Array;
  readonly b: Float64Array;
};

function emptyGrid(cols: number, rows: number): Grid {
  const n = cols * rows;
  return {
    cols,
    rows,
    r: new Float64Array(n),
    g: new Float64Array(n),
    b: new Float64Array(n),
  };
}

function downsampleAverage(buffer: PixelBuffer, cell: CellPx, cols: number, rows: number): Grid {
  const grid = emptyGrid(cols, rows);
  const { width, height, data } = buffer;
  for (let cy = 0; cy < rows; cy += 1) {
    const yBounds = cellBounds(cy, rows, height, cell);
    for (let cx = 0; cx < cols; cx += 1) {
      const xBounds = cellBounds(cx, cols, width, cell);
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = yBounds.start; y < yBounds.end; y += 1) {
        for (let x = xBounds.start; x < xBounds.end; x += 1) {
          const src = (y * width + x) * 4;
          r += data[src] ?? 0;
          g += data[src + 1] ?? 0;
          b += data[src + 2] ?? 0;
          count += 1;
        }
      }
      const index = cy * cols + cx;
      grid.r[index] = r / count;
      grid.g[index] = g / count;
      grid.b[index] = b / count;
    }
  }
  return grid;
}

function addError(
  channel: Float64Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
  err: number,
  taps: readonly Tap[],
  dir: 1 | -1,
): void {
  for (const tap of taps) {
    const nx = x + tap.dx * dir;
    const ny = y + tap.dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
      continue;
    }
    const index = ny * cols + nx;
    channel[index] = (channel[index] ?? 0) + err * tap.weight;
  }
}

function nearestInk(rgb: Rgb, inks: NonEmptyRgb): Rgb {
  const [first] = inks;
  let best = first;
  let bestDist = Infinity;
  for (const ink of inks) {
    const dr = rgb.r - ink.r;
    const dg = rgb.g - ink.g;
    const db = rgb.b - ink.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = ink;
    }
  }
  return best;
}

function orderedChannel(value: number, levels: 3 | 4 | 5, threshold: number): number {
  const scaled = (clampByte(value) / 255) * (levels - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(levels - 1, lower + 1);
  const level = scaled - lower > threshold ? upper : lower;
  const step = 255 / (levels - 1);
  return level * step;
}

function bayerUnit(x: number, y: number): number {
  const value = BAYER_8[(y % 8) * 8 + (x % 8)] ?? 0;
  return (value + 0.5) / 64;
}

function diffuseDuo(input: {
  grid: Grid;
  ink: Rgb;
  paper: Rgb;
  kernel: KernelId;
  noise: number;
  bias: number;
}): Rgb[] {
  const { grid, ink, paper, kernel, noise, bias } = input;
  const { cols, rows } = grid;
  const luma = new Float64Array(cols * rows);
  for (let i = 0; i < luma.length; i += 1) {
    const rgb = { r: grid.r[i] ?? 0, g: grid.g[i] ?? 0, b: grid.b[i] ?? 0 };
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    luma[i] = luminance(rgb) + noiseDelta(cx, cy, 17, noise);
  }
  const taps = KERNELS[kernel];
  const inkLuma = luminance(ink);
  const paperLuma = luminance(paper);
  const stamped: Rgb[] = [];
  for (let y = 0; y < rows; y += 1) {
    const rtl = y % 2 === 1;
    const dir: 1 | -1 = rtl ? -1 : 1;
    const start = rtl ? cols - 1 : 0;
    for (let n = 0; n < cols; n += 1) {
      const x = start + n * dir;
      const index = y * cols + x;
      const current = luma[index] ?? 0;
      const probed = current + bias;
      const paperChosen = Math.abs(probed - paperLuma) < Math.abs(probed - inkLuma);
      const chosen = paperChosen ? paper : ink;
      stamped[index] = chosen;
      const chosenLuma = paperChosen ? paperLuma : inkLuma;
      addError(luma, cols, rows, x, y, current - chosenLuma, taps, dir);
    }
  }
  return stamped;
}

function diffusePrint(input: {
  grid: Grid;
  inks: NonEmptyRgb;
  kernel: KernelId;
  noise: number;
  bias: number;
}): Rgb[] {
  const { grid, inks, kernel, noise, bias } = input;
  const { cols, rows, r, g, b } = grid;
  for (let i = 0; i < r.length; i += 1) {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    const delta = noiseDelta(cx, cy, 3, noise);
    r[i] = (r[i] ?? 0) + delta;
    g[i] = (g[i] ?? 0) + delta;
    b[i] = (b[i] ?? 0) + delta;
  }
  const taps = KERNELS[kernel];
  const stamped: Rgb[] = [];
  for (let y = 0; y < rows; y += 1) {
    const rtl = y % 2 === 1;
    const dir: 1 | -1 = rtl ? -1 : 1;
    const start = rtl ? cols - 1 : 0;
    for (let n = 0; n < cols; n += 1) {
      const x = start + n * dir;
      const index = y * cols + x;
      const currentR = r[index] ?? 0;
      const currentG = g[index] ?? 0;
      const currentB = b[index] ?? 0;
      const current = {
        r: clampByte(currentR + bias),
        g: clampByte(currentG + bias),
        b: clampByte(currentB + bias),
      };
      const chosen = nearestInk(current, inks);
      stamped[index] = chosen;
      addError(r, cols, rows, x, y, currentR - chosen.r, taps, dir);
      addError(g, cols, rows, x, y, currentG - chosen.g, taps, dir);
      addError(b, cols, rows, x, y, currentB - chosen.b, taps, dir);
    }
  }
  return stamped;
}

function orderedBitgrain(input: {
  grid: Grid;
  levels: 3 | 4 | 5;
  noise: number;
  bias: number;
}): Rgb[] {
  const { grid, levels, noise, bias } = input;
  const { cols, rows } = grid;
  const stamped: Rgb[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      const threshold = bayerUnit(x, y);
      const offset = noiseDelta(x, y, 11, noise) + bias;
      stamped[index] = {
        r: orderedChannel((grid.r[index] ?? 0) + offset, levels, threshold),
        g: orderedChannel((grid.g[index] ?? 0) + offset, levels, threshold),
        b: orderedChannel((grid.b[index] ?? 0) + offset, levels, threshold),
      };
    }
  }
  return stamped;
}

function stampLook(input: {
  grid: Grid;
  look: Look;
  kernel: KernelId;
  noise: number;
  bias: number;
}): Rgb[] {
  const { grid, look, kernel, noise, bias } = input;
  if (look.kind === "duo") {
    return diffuseDuo({ grid, ink: look.ink, paper: look.paper, kernel, noise, bias });
  }
  if (look.kind === "print") {
    return diffusePrint({ grid, inks: look.inks, kernel, noise, bias });
  }
  if (look.kind === "bitgrain") {
    return orderedBitgrain({ grid, levels: look.levelsPerChannel, noise, bias });
  }
  const _exhaustive: never = look;
  return _exhaustive;
}

function chromaScale(target: number, delta: number): number {
  if (delta > 0) {
    return (255 - target) / delta;
  }
  if (delta < 0) {
    return target / -delta;
  }
  return 1;
}

function mixLuma(stamp: Rgb, sourceLuma: number, blend: number): Rgb {
  const stampLuma = luminance(stamp);
  const target = stampLuma * (1 - blend) + sourceLuma * blend;
  const redDelta = stamp.r - stampLuma;
  const greenDelta = stamp.g - stampLuma;
  const blueDelta = stamp.b - stampLuma;
  const scale = Math.min(
    1,
    chromaScale(target, redDelta),
    chromaScale(target, greenDelta),
    chromaScale(target, blueDelta),
  );
  return {
    r: clampByte(target + redDelta * scale),
    g: clampByte(target + greenDelta * scale),
    b: clampByte(target + blueDelta * scale),
  };
}

export function applyPrintSim(buffer: PixelBuffer, recipe: PrintRecipe): PixelBuffer {
  const contrasted = contrastBuffer(buffer, recipe.contrast);
  const cell = effectiveCell(recipe.cell, contrasted.width, contrasted.height);
  const { cols, rows } = downsampleSize(contrasted.width, contrasted.height, cell);
  const grid = downsampleAverage(contrasted, cell, cols, rows);
  const cells = stampLook({
    grid,
    look: recipe.look,
    kernel: recipe.kernel,
    noise: recipe.noise,
    bias: recipe.bias,
  });
  const out = cloneBuffer(contrasted);
  const { width, height, data } = out;
  const src = contrasted.data;
  for (let cy = 0; cy < rows; cy += 1) {
      const yBounds = cellBounds(cy, rows, height, cell);
      for (let cx = 0; cx < cols; cx += 1) {
      const stamp = cells[cy * cols + cx];
      if (!stamp) {
        throw new Error(`missing stamped cell at ${cx},${cy}`);
      }
      const xBounds = cellBounds(cx, cols, width, cell);
      for (let y = yBounds.start; y < yBounds.end; y += 1) {
        for (let x = xBounds.start; x < xBounds.end; x += 1) {
          const index = (y * width + x) * 4;
          const sourceLuma = luminance({
            r: src[index] ?? 0,
            g: src[index + 1] ?? 0,
            b: src[index + 2] ?? 0,
          });
          const mixed = mixLuma(stamp, sourceLuma, recipe.blend);
          data[index] = mixed.r;
          data[index + 1] = mixed.g;
          data[index + 2] = mixed.b;
        }
      }
    }
  }
  return out;
}
