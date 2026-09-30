import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8").replace(/<script[^>]*src="[^"]*"><\/script>/g, "");
const app = readFileSync(new URL("app.js", root), "utf8");

// images: name "WxH.jpg" loads with that size; "bad.*" fails
export function loadPage({ bands = [] } = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  w.addEventListener("unhandledrejection", (e) => errors.push(e.reason));
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (r) => errors.push(r));
  w.URL.createObjectURL = (f) => "blob:" + f.name;
  w.URL.revokeObjectURL = () => {};
  class FakeImage {
    set src(u) {
      this._src = u;
      setTimeout(() => {
        const m = /(\d+)x(\d+)/.exec(u);
        if (!m || /bad/.test(u)) return this.onerror && this.onerror();
        this.naturalWidth = +m[1];
        this.naturalHeight = +m[2];
        this.onload && this.onload();
      });
    }
    get src() { return this._src; }
  }
  w.Image = FakeImage;
  // canvas: brightness rows are dark except rows inside `bands` (fractions of height)
  w.HTMLCanvasElement.prototype.getContext = function () {
    const c = this;
    return {
      drawImage() {},
      getImageData(x, y, cw, ch) {
        const d = new Uint8ClampedArray(cw * ch * 4);
        for (let r = 0; r < ch; r++) {
          const f = r / ch;
          const v = bands.some(([a, b]) => f >= a && f < b) ? 255 : 60;
          d.fill(v, r * cw * 4, (r + 1) * cw * 4);
        }
        return { data: d };
      },
    };
  };
  w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,";
  w.eval(app);
  const $ = (id) => w.document.getElementById(id);
  const file = (name, size = 1000) => {
    const f = new w.File(["x"], name);
    Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const pick = async (f) => {
    Object.defineProperty($("file"), "files", { value: [f], configurable: true });
    $("file").dispatchEvent(new w.Event("change"));
    await new Promise((r) => setTimeout(r, 20));
  };
  return { window: w, $, file, pick, errors };
}
