import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("local-first scan", () => {
  it("does not ship image upload or model calls", () => {
    const files = walk("src").filter(
      (path) => (path.endsWith(".ts") || path.endsWith(".css")) && !path.endsWith(".test.ts"),
    );
    const body = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(body).not.toMatch(/https?:\/\/[^\s"']+\/(upload|predict|infer)/i);
    expect(body).not.toMatch(/new FormData\(/);
    expect(body).not.toMatch(/tensorflow|onnx|webgpu/i);
  });
});
