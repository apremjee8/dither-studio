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

async function darkestQuartileMean(page: Page): Promise<{ r: number; g: number; b: number }> {
  return page.getByTestId("preview-canvas").evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("preview is not a canvas");
    }
    const ctx = node.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable");
    }
    const image = ctx.getImageData(0, 0, node.width, node.height);
    const bins = Array.from({ length: 256 }, () => ({ count: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const bin = bins[luma];
      if (bin) {
        bin.count += 1;
        bin.r += r;
        bin.g += g;
        bin.b += b;
      }
    }
    const target = Math.max(1, Math.floor((image.data.length / 4) * 0.25));
    let remaining = target;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const bin of bins) {
      if (remaining === 0 || bin.count === 0) {
        continue;
      }
      const count = Math.min(remaining, bin.count);
      const fraction = count / bin.count;
      r += bin.r * fraction;
      g += bin.g * fraction;
      b += bin.b * fraction;
      remaining -= count;
    }
    return { r: r / target, g: g / target, b: b / target };
  });
}

function dist(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
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

test("presets keep source dimensions and produce distinct previews", async ({ page }) => {
  await upload(page, "image/png", "source.png");
  const source = await sourcePixels(page);
  expect(source.width).toBe(SOURCE_WIDTH);
  expect(source.height).toBe(SOURCE_HEIGHT);

  const seen = new Set<string>([source.hash]);
  for (const id of [
    "bitgrain",
    "cyanotype",
    "cobalt",
    "print-halftone",
    "denim",
    "meadow",
  ]) {
    await page.getByTestId(`preset-${id}`).click();
    const next = await previewPixels(page);
    expect(next.width).toBe(source.width);
    expect(next.height).toBe(source.height);
    expect(seen.has(next.hash)).toBe(false);
    seen.add(next.hash);
  }

  await page.getByRole("button", { name: /Cyanotype/ }).click();
  const cyanDark = await darkestQuartileMean(page);
  expect(dist(cyanDark, { r: 2, g: 92, b: 116 })).toBeLessThan(
    dist(cyanDark, { r: 243, g: 248, b: 244 }),
  );

  await page.getByRole("button", { name: /Cobalt/ }).click();
  const cobaltDark = await darkestQuartileMean(page);
  expect(dist(cobaltDark, { r: 49, g: 61, b: 235 })).toBeLessThan(
    dist(cobaltDark, { r: 248, g: 248, b: 252 }),
  );
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

async function overflowsX(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return root.scrollWidth > root.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1;
  });
}

async function boxHeight(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) {
    throw new Error(`${testId} has no box`);
  }
  return box.height;
}

async function fullyInViewport(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= -1 &&
      rect.left >= -1 &&
      rect.bottom <= window.innerHeight + 1 &&
      rect.right <= window.innerWidth + 1
    );
  });
}

const PHONE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("phone chrome stays usable", async ({ page }) => {
      await expect(page.getByTestId("empty")).toBeVisible();
      await expect(page.locator(".mark")).toBeVisible();
      await expect(page.getByTestId("upload")).toBeVisible();
      await expect(page.getByTestId("download")).toBeVisible();

      expect(await boxHeight(page, "upload")).toBeGreaterThanOrEqual(44);
      expect(await boxHeight(page, "download")).toBeGreaterThanOrEqual(44);

      const presetButtons = page.locator("#preset-dock .preset");
      await expect(presetButtons.first()).toBeVisible();
      const presetCount = await presetButtons.count();
      expect(presetCount).toBeGreaterThan(0);
      for (let index = 0; index < presetCount; index += 1) {
        const box = await presetButtons.nth(index).boundingBox();
        if (!box) {
          throw new Error("preset has no box");
        }
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      expect(await fullyInViewport(page, "empty")).toBe(true);
      expect(await fullyInViewport(page, "upload")).toBe(true);
      expect(await fullyInViewport(page, "download")).toBe(true);
      expect(await fullyInViewport(page, "presets")).toBe(true);

      const emptyOverflows = await page.getByTestId("empty").evaluate((node) => {
        return node.scrollWidth > node.clientWidth + 1;
      });
      expect(emptyOverflows).toBe(false);
      expect(await overflowsX(page)).toBe(false);

      const sheet = await page.getByTestId("preview").boundingBox();
      if (!sheet) {
        throw new Error("preview has no box");
      }
      expect(sheet.height).toBeGreaterThan(viewport.height * 0.4);

      await upload(page, "image/png", "phone.png");
      await expect(page.getByTestId("preview-canvas")).toBeVisible();
      const canvasBox = await page.getByTestId("preview-canvas").boundingBox();
      if (!canvasBox) {
        throw new Error("preview canvas has no box");
      }
      expect(canvasBox.width).toBeLessThanOrEqual(viewport.width);
      expect(await overflowsX(page)).toBe(false);
      expect(await fullyInViewport(page, "upload")).toBe(true);
      expect(await fullyInViewport(page, "download")).toBe(true);
    });
  });
}

test.describe("desktop 900", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test("keeps the three-column dock", async ({ page }) => {
    const columns = await page.locator(".dock").evaluate((node) => {
      return getComputedStyle(node).gridTemplateColumns.split(" ").length;
    });
    expect(columns).toBe(3);
    expect(await overflowsX(page)).toBe(false);
  });
});
