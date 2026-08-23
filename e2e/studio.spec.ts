import { expect, test, type Page } from "@playwright/test";

const SOURCE_WIDTH = 1200;
const SOURCE_HEIGHT = 800;

async function makeFixture(
  page: Page,
  mime: "image/jpeg" | "image/png" | "image/webp",
): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ mime, width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("2d context unavailable");
      }
      const wash = ctx.createLinearGradient(0, 0, width, height);
      wash.addColorStop(0, "#c23b22");
      wash.addColorStop(0.45, "#4a7fb5");
      wash.addColorStop(1, "#efe6d4");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#1a1a14";
      ctx.fillRect(18, 14, 22, 28);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mime, 0.92);
      });
      if (!blob) {
        throw new Error(`could not encode ${mime}`);
      }
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { mime, width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
  );
  return Buffer.from(bytes);
}

async function upload(
  page: Page,
  mime: "image/jpeg" | "image/png" | "image/webp",
  name: string,
): Promise<void> {
  const buffer = await makeFixture(page, mime);
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: mime,
    buffer,
  });
  await expect(page.getByTestId("preview")).toHaveClass(/has-image/);
}

async function sourcePixels(page: Page): Promise<{
  width: number;
  height: number;
  hash: string;
}> {
  return page.evaluate(async () => {
    const input = document.querySelector("[data-testid=file-input]");
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      throw new Error("no uploaded file");
    }
    const bitmap = await createImageBitmap(input.files[0]);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable");
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let i = 0; i < image.data.length; i += 1) {
      hash = (hash * 33 + (image.data[i] ?? 0)) >>> 0;
    }
    return { width: canvas.width, height: canvas.height, hash: String(hash) };
  });
}

async function previewPixels(page: Page): Promise<{
  width: number;
  height: number;
  hash: string;
  sample: number[];
}> {
  return page.getByTestId("preview-canvas").evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("preview is not a canvas");
    }
    const ctx = node.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable");
    }
    const image = ctx.getImageData(0, 0, node.width, node.height);
    let hash = 0;
    for (let i = 0; i < image.data.length; i += 1) {
      hash = (hash * 33 + (image.data[i] ?? 0)) >>> 0;
    }
    return {
      width: node.width,
      height: node.height,
      hash: String(hash),
      sample: Array.from(image.data.slice(0, 48)),
    };
  });
}

async function uniquePreviewColors(page: Page): Promise<string[]> {
  return page.getByTestId("preview-canvas").evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("preview is not a canvas");
    }
    const ctx = node.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable");
    }
    const image = ctx.getImageData(0, 0, node.width, node.height);
    const colors = new Set<string>();
    for (let i = 0; i < image.data.length; i += 4) {
      colors.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`);
    }
    return [...colors];
  });
}

function pngSize(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    const original = window.fetch;
    window.fetch = async (...args) => {
      const init = args[1];
      if (init?.body) {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        store.push(url);
      }
      return original.apply(window, args);
    };
    Reflect.set(window, "__fetchBodies", store);
  });
  await page.goto("/");
});

test("loads jpg, png, and webp into the preview", async ({ page }) => {
  for (const [mime, name] of [
    ["image/jpeg", "scene.jpg"],
    ["image/png", "scene.png"],
    ["image/webp", "scene.webp"],
  ] as const) {
    await page.goto("/");
    await upload(page, mime, name);
    const pixels = await previewPixels(page);
    expect(pixels.width).toBeGreaterThan(1);
    expect(pixels.height).toBeGreaterThan(1);
    expect(pixels.sample.some((value) => value !== 0)).toBe(true);
  }
});

test("four presets change preview pixels versus the source upload", async ({ page }) => {
  await upload(page, "image/png", "source.png");
  const source = await sourcePixels(page);
  expect(source.width).toBe(SOURCE_WIDTH);
  expect(source.height).toBe(SOURCE_HEIGHT);

  const seen = new Set<string>([source.hash]);
  for (const id of ["bitgrain", "cyanotype", "cobalt", "print-halftone"] as const) {
    await page.getByTestId(`preset-${id}`).click();
    const next = await previewPixels(page);
    expect(next.width).toBe(source.width);
    expect(next.height).toBe(source.height);
    expect(seen.has(next.hash)).toBe(false);
    seen.add(next.hash);
  }

  await page.getByRole("button", { name: /Cyanotype/ }).click();
  const cyanColors = await uniquePreviewColors(page);
  expect(cyanColors).toHaveLength(2);
  expect(cyanColors).toEqual(expect.arrayContaining(["10,79,84", "244,241,232"]));

  await page.getByRole("button", { name: /Cobalt/ }).click();
  const cobaltColors = await uniquePreviewColors(page);
  expect(cobaltColors).toHaveLength(2);
  expect(cobaltColors).toEqual(expect.arrayContaining(["0,61,255", "255,255,255"]));
});

test("download PNG matches the source width and height", async ({ page }) => {
  await upload(page, "image/jpeg", "lake.jpg");
  await page.getByTestId("preset-print-halftone").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error("download stream missing");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const file = Buffer.concat(chunks);
  expect(file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  const size = pngSize(file);
  expect(size).toEqual({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT });
  const previewBox = await page.getByTestId("preview-canvas").boundingBox();
  expect(previewBox).toBeTruthy();
  if (previewBox) {
    expect(size.width === Math.round(previewBox.width) && size.height === Math.round(previewBox.height)).toBe(
      false,
    );
  }
});

test("no request sends image bytes", async ({ page }) => {
  const bodies: string[] = [];
  page.on("request", (request) => {
    const data = request.postDataBuffer();
    if (!data || data.length === 0) {
      return;
    }
    const head = data.subarray(0, 8);
    const isPng = head.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = head[0] === 0xff && head[1] === 0xd8;
    const isWebp = data.subarray(0, 4).toString("ascii") === "RIFF";
    if (isPng || isJpeg || isWebp) {
      bodies.push(request.url());
    }
  });
  await upload(page, "image/webp", "field.webp");
  await page.getByTestId("preset-cobalt").click();
  const downloads = page.waitForEvent("download");
  await page.getByTestId("download").click();
  await downloads;
  const leaked = await page.evaluate(() => {
    const store = Reflect.get(window, "__fetchBodies");
    return Array.isArray(store) ? store : [];
  });
  expect(bodies).toEqual([]);
  expect(leaked).toEqual([]);
});
