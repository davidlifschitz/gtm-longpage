import { it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
it("loads no remote scripts", () => {
  const html = readFileSync("index.html", "utf8");
  expect(html).not.toMatch(/<script[^>]+src=["']https?:/);
  expect(existsSync("vendor/pdf-lib.min.js")).toBe(true);
});
