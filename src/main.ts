import { type StudioState, isAllowedMime, scaleNearest } from "./domain";
import { PRESETS, applyPreset } from "./presets";
import { gradientBuffer } from "./fixtures";
import {
  decodeImageFile,
  downloadName,
  emptyStudio,
  encodePng,
  loadStudio,
  paintBuffer,
  selectPreset,
} from "./studio";

function requireElement<T extends Element>(
  value: Element | null,
  isType: (node: Element) => node is T,
): T {
  if (!value || !isType(value)) {
    throw new Error("studio markup is missing");
  }
  return value;
}

const preview = requireElement(
  document.querySelector("[data-testid=preview]"),
  (node): node is HTMLElement => node instanceof HTMLElement,
);
const canvas = requireElement(
  document.querySelector("[data-testid=preview-canvas]"),
  (node): node is HTMLCanvasElement => node instanceof HTMLCanvasElement,
);
const fileInput = requireElement(
  document.querySelector("[data-testid=file-input]"),
  (node): node is HTMLInputElement => node instanceof HTMLInputElement,
);
const downloadBtn = requireElement(
  document.querySelector("[data-testid=download]"),
  (node): node is HTMLButtonElement => node instanceof HTMLButtonElement,
);
const dock = requireElement(
  document.querySelector("[data-testid=presets]"),
  (node): node is HTMLElement => node instanceof HTMLElement,
);

let state: StudioState = emptyStudio();
const sample = gradientBuffer(84, 56);

function renderDock(): void {
  dock.replaceChildren();
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.testid = `preset-${preset.id}`;
    button.setAttribute("aria-label", `${preset.name}. ${preset.blurb}`);
    button.setAttribute("aria-pressed", String(state.status === "ready" && state.presetId === preset.id));
    const thumb = document.createElement("canvas");
    thumb.width = 84;
    thumb.height = 56;
    const source = state.status === "ready" ? scaleNearest(state.source, 84, 56) : sample;
    paintBuffer(thumb, applyPreset(source, preset.id));
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = preset.name;
    button.append(thumb, label);
    button.addEventListener("click", () => {
      state = selectPreset(state, preset.id);
      if (state.status === "empty") {
        state = loadStudio({
          fileName: "sample.png",
          mime: "image/png",
          source: sample,
          presetId: preset.id,
        });
      }
      paint();
    });
    dock.append(button);
  }
}

function paint(): void {
  if (state.status === "empty") {
    preview.classList.remove("has-image");
    downloadBtn.disabled = true;
    renderDock();
    return;
  }
  preview.classList.add("has-image");
  paintBuffer(canvas, state.output);
  downloadBtn.disabled = false;
  renderDock();
}

async function ingest(file: File): Promise<void> {
  if (!isAllowedMime(file.type)) {
    return;
  }
  const source = await decodeImageFile(file);
  const presetId = state.status === "ready" ? state.presetId : undefined;
  state = loadStudio({
    fileName: file.name,
    mime: file.type,
    source,
    ...(presetId ? { presetId } : {}),
  });
  paint();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    void ingest(file);
  }
});

preview.addEventListener("dragover", (event) => {
  event.preventDefault();
});

preview.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file) {
    void ingest(file);
  }
});

downloadBtn.addEventListener("click", async () => {
  if (state.status !== "ready") {
    return;
  }
  const blob = await encodePng(state.output);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName(state.fileName, state.presetId);
  link.click();
  URL.revokeObjectURL(url);
});

renderDock();
paint();
