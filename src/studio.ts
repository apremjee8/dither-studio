import {
  type AllowedMime,
  type PixelBuffer,
  type PresetId,
  type StudioState,
  cloneBuffer,
  isAllowedMime,
} from "./domain";
import { DEFAULT_PRESET_ID, applyPreset } from "./presets";

export function emptyStudio(): StudioState {
  return { status: "empty" };
}

export function loadStudio(input: {
  fileName: string;
  mime: AllowedMime;
  source: PixelBuffer;
  presetId?: PresetId;
}): StudioState {
  const presetId = input.presetId ?? DEFAULT_PRESET_ID;
  return {
    status: "ready",
    fileName: input.fileName,
    mime: input.mime,
    source: cloneBuffer(input.source),
    output: applyPreset(input.source, presetId),
    presetId,
  };
}

export function selectPreset(state: StudioState, presetId: PresetId): StudioState {
  if (state.status !== "ready") {
    return state;
  }
  return {
    ...state,
    presetId,
    output: applyPreset(state.source, presetId),
  };
}

export async function decodeImageFile(file: File): Promise<PixelBuffer> {
  if (!isAllowedMime(file.type)) {
    throw new Error(`unsupported type: ${file.type}`);
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("2d context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: image.width,
    height: image.height,
    data: image.data,
  };
}

export function bufferToImageData(buffer: PixelBuffer): ImageData {
  return new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height);
}

export function paintBuffer(canvas: HTMLCanvasElement, buffer: PixelBuffer): void {
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("2d context unavailable");
  }
  ctx.putImageData(bufferToImageData(buffer), 0, 0);
}

export async function encodePng(buffer: PixelBuffer): Promise<Blob> {
  const canvas = document.createElement("canvas");
  paintBuffer(canvas, buffer);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error("png encode failed");
  }
  return blob;
}

export function downloadName(fileName: string, presetId: PresetId): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base}-${presetId}.png`;
}
