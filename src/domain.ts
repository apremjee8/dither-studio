export type Rgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type NonEmptyRgb = readonly [Rgb, ...Rgb[]];

export type PixelBuffer = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

export type CellPx = number & { readonly __brand: "CellPx" };

export function cellPx(value: number): CellPx {
  if (!(value > 1) || !Number.isFinite(value)) {
    throw new Error(`cell size must be > 1, got ${value}`);
  }
  return value as CellPx;
}

export function downsampleSize(
  width: number,
  height: number,
  cell: CellPx,
): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.ceil(width / cell)),
    rows: Math.max(1, Math.ceil(height / cell)),
  };
}

const CELL_REFERENCE_SHORT_SIDE = 480;

export function effectiveCell(cell: CellPx, width: number, height: number): CellPx {
  const short = Math.min(width, height);
  const scale = Math.max(1, short / CELL_REFERENCE_SHORT_SIDE);
  return cellPx(cell * scale);
}

export type KernelId = "floyd-steinberg" | "atkinson" | "sierra" | "simple";

export type Look =
  | { readonly kind: "duo"; readonly ink: Rgb; readonly paper: Rgb }
  | { readonly kind: "bitgrain"; readonly levelsPerChannel: 3 | 4 | 5 }
  | { readonly kind: "print"; readonly inks: NonEmptyRgb };

export type PrintRecipe = {
  readonly id: PresetId;
  readonly name: string;
  readonly blurb: string;
  readonly contrast: number;
  readonly cell: CellPx;
  readonly kernel: KernelId;
  readonly noise: number;
  readonly bias: number;
  readonly blend: number;
  readonly look: Look;
};

export type PresetId =
  | "bitgrain"
  | "cyanotype"
  | "cobalt"
  | "print-halftone"
  | "risograph"
  | "paper-grain"
  | "denim"
  | "meadow";

export type Preset = PrintRecipe;

export type StudioState =
  | { readonly status: "empty" }
  | {
      readonly status: "ready";
      readonly fileName: string;
      readonly mime: "image/jpeg" | "image/png" | "image/webp";
      readonly source: PixelBuffer;
      readonly output: PixelBuffer;
      readonly presetId: PresetId;
    };

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp";

export function isAllowedMime(value: string): value is AllowedMime {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

export function cloneBuffer(buffer: PixelBuffer): PixelBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data),
  };
}

export function scaleNearest(buffer: PixelBuffer, width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(buffer.height - 1, Math.floor(((y + 0.5) * buffer.height) / height));
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(buffer.width - 1, Math.floor(((x + 0.5) * buffer.width) / width));
      const src = (srcY * buffer.width + srcX) * 4;
      const dest = (y * width + x) * 4;
      data[dest] = buffer.data[src] ?? 0;
      data[dest + 1] = buffer.data[src + 1] ?? 0;
      data[dest + 2] = buffer.data[src + 2] ?? 0;
      data[dest + 3] = 255;
    }
  }
  return { width, height, data };
}

export function buffersDiffer(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) {
    return true;
  }
  const left = a.data;
  const right = b.data;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return true;
    }
  }
  return false;
}

export function hexRgb(hex: string): Rgb {
  const body = hex.startsWith("#") ? hex.slice(1) : hex;
  if (body.length !== 6) {
    throw new Error(`expected #rrggbb, got ${hex}`);
  }
  return {
    r: Number.parseInt(body.slice(0, 2), 16),
    g: Number.parseInt(body.slice(2, 4), 16),
    b: Number.parseInt(body.slice(4, 6), 16),
  };
}

export function rgbEqual(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function luminance(rgb: Rgb): number {
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

export function withBlend(recipe: PrintRecipe, blend: number): PrintRecipe {
  return { ...recipe, blend };
}
