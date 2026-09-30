import { it, expect } from "vitest";
import { loadPage } from "./page.js";
it("splits on white gutters", async () => {
  const p = loadPage({ bands: [[0.32, 0.34], [0.65, 0.67]] });
  await p.pick(p.file("1000x4000.jpg"));
  expect(p.$("pages").value).toBe("3");
  expect(p.$("run").disabled).toBe(false);
});
it("falls back to even split with no gutters", async () => {
  const p = loadPage();
  await p.pick(p.file("1000x4000.jpg"));
  expect(p.$("pages").value).toBe("2");
});
it("rejects files over 25 MB", async () => {
  const p = loadPage();
  await p.pick(p.file("1000x4000.jpg", 26 * 1024 * 1024));
  expect(p.$("error").textContent).toMatch(/25 MB/);
});
it("says so when the file isn't a readable image", async () => {
  const p = loadPage();
  await p.pick(p.file("bad.heic"));
  expect(p.$("error").hidden).toBe(false);
  expect(p.$("error").textContent).toMatch(/Could not read/);
});
