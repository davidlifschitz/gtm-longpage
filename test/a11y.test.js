import { it, expect } from "vitest";
import { loadPage } from "./page.js";
it("announces status/errors, labels input, numbers previews", async () => {
  const p = loadPage({ bands: [[0.5 - 0.01, 0.5 + 0.01]] });
  expect(p.$("status").getAttribute("aria-live")).toBe("polite");
  expect(p.$("error").getAttribute("role")).toBe("alert");
  expect(p.$("file").getAttribute("aria-label")).toBeTruthy();
  await p.pick(p.file("1000x4000.jpg"));
  const alts = [...p.$("thumbs").querySelectorAll("#thumbs img")].map((i) => i.alt);
  expect(alts[0]).toMatch(/Page 1 of \d+/);
});
