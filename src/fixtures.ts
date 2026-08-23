import type { PixelBuffer } from "./domain";

export function gradientBuffer(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / Math.max(width - 1, 1)) * 255);
      data[i + 1] = Math.round((y / Math.max(height - 1, 1)) * 255);
      data[i + 2] = 96;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function solidBuffer(width: number, height: number, r: number, g: number, b: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}
