import { it, expect } from "vitest";
import { loadPage } from "./page.js";
it("warns instead of silently dropping pages past 60", async () => {
  const bands = Array.from({ length: 79 }, (_, i) => [(i + 1) / 80 - 0.003, (i + 1) / 80 + 0.003]);
  const p = loadPage({ bands });
  await p.pick(p.file("1000x60000.jpg"));
  expect(p.$("pages").value).toBe("60");
  expect(p.$("error").hidden).toBe(false);
  expect(p.$("error").textContent).toMatch(/Found \d+ pages.*first 60/);
});
