const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 60;
const MAX_EDGE = 8000;

const els = {
  drop: document.getElementById("drop"),
  file: document.getElementById("file"),
  pick: document.getElementById("pick"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  pages: document.getElementById("pages"),
  auto: document.getElementById("auto"),
  thumbs: document.getElementById("thumbs"),
  run: document.getElementById("run"),
};

let img = null;
let cuts = [];

function setError(msg) {
  els.error.hidden = !msg;
  els.error.textContent = msg || "";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

function equalCuts(h, n) {
  const count = Math.max(2, Math.min(MAX_PAGES, n));
  const slice = h / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    const y0 = Math.round(i * slice);
    const y1 = Math.round((i + 1) * slice);
    out.push([y0, Math.max(y1, y0 + 1)]);
  }
  out[out.length - 1][1] = h;
  return out;
}

function detectCuts(image) {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const scale = Math.min(1, 400 / w);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;
  const bright = new Float32Array(ch);
  for (let y = 0; y < ch; y++) {
    let s = 0;
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      s += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    bright[y] = s / cw;
  }
  const mid = 235;
  const minBand = Math.max(4, Math.round(ch * 0.004));
  const bands = [];
  let start = -1;
  for (let y = 0; y < ch; y++) {
    if (bright[y] >= mid) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start >= minBand) bands.push([start, y]);
      start = -1;
    }
  }
  if (start >= 0 && ch - start >= minBand) bands.push([start, ch]);

  const inner = bands.filter((b) => b[0] > ch * 0.02 && b[1] < ch * 0.98);
  if (inner.length < 1) return equalCuts(h, Number(els.pages.value) || 2);

  const ratio = h / ch;
  const ys = [0];
  for (const [a, b] of inner) {
    ys.push(Math.round(((a + b) / 2) * ratio));
  }
  ys.push(h);
  const uniq = [...new Set(ys)].sort((a, b) => a - b);
  const slices = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    if (uniq[i + 1] - uniq[i] < h * 0.02) continue;
    slices.push([uniq[i], uniq[i + 1]]);
  }
  if (slices.length < 2) return equalCuts(h, Number(els.pages.value) || 2);
  return slices.slice(0, MAX_PAGES);
}

function applyCuts(list) {
  cuts = list;
  els.pages.value = String(cuts.length);
  els.status.textContent = img
    ? `${img.naturalWidth}×${img.naturalHeight} · ${cuts.length} pages · files stayed in this tab`
    : "Waiting for a tall scan.";
  els.run.disabled = !img || cuts.length < 2;
  paintThumbs();
}

function paintThumbs() {
  els.thumbs.innerHTML = "";
  if (!img || !cuts.length) return;
  const w = img.naturalWidth;
  cuts.slice(0, 8).forEach(([y0, y1]) => {
    const c = document.createElement("canvas");
    const h = Math.max(1, y1 - y0);
    const tw = 160;
    const th = Math.max(40, Math.round((h / w) * tw));
    c.width = tw;
    c.height = th;
    c.getContext("2d").drawImage(img, 0, y0, w, h, 0, 0, tw, th);
    const im = document.createElement("img");
    im.src = c.toDataURL("image/jpeg", 0.7);
    im.alt = "page preview";
    els.thumbs.appendChild(im);
  });
}

async function sliceToJpeg(y0, y1) {
  const w = img.naturalWidth;
  const h = y1 - y0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, y0, w, h, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  return new Uint8Array(await blob.arrayBuffer());
}

async function makePdf() {
  const { PDFDocument } = PDFLib;
  const pdf = await PDFDocument.create();
  for (const [y0, y1] of cuts) {
    const bytes = await sliceToJpeg(y0, y1);
    const jpg = await pdf.embedJpg(bytes);
    const page = pdf.addPage([jpg.width, jpg.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  }
  const out = await pdf.save();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
  a.download = "longpage.pdf";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function ingest(file) {
  setError("");
  if (file.size > MAX_BYTES) {
    setError(`${file.name} is over 25 MB.`);
    return;
  }
  let image;
  try {
    image = await loadImage(file);
  } catch (err) {
    setError(`${file.name}: ${err.message} Try a JPG, PNG, or WebP.`);
    return;
  }
  if (image.naturalHeight < image.naturalWidth * 1.2) {
    setError("That image is not much taller than it is wide. This tool is for stacked pages.");
  }
  if (image.naturalWidth > MAX_EDGE || image.naturalHeight > MAX_EDGE * 8) {
    setError("Image is too large for this tab. Crop a batch first.");
    return;
  }
  img = image;
  applyCuts(detectCuts(img));
}

els.pick.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", () => {
  if (els.file.files[0]) ingest(els.file.files[0]);
  els.file.value = "";
});
els.auto.addEventListener("click", () => {
  if (img) applyCuts(detectCuts(img));
});
els.pages.addEventListener("change", () => {
  if (img) applyCuts(equalCuts(img.naturalHeight, Number(els.pages.value) || 2));
});
els.run.addEventListener("click", async () => {
  els.run.disabled = true;
  els.status.textContent = "Building PDF…";
  try {
    await makePdf();
    els.status.textContent = `${cuts.length} pages · files stayed in this tab`;
  } catch (err) {
    setError(err && err.message ? err.message : String(err));
  } finally {
    els.run.disabled = !img;
  }
});

["dragenter", "dragover"].forEach((ev) => {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.add("over");
  });
});
els.drop.addEventListener("dragleave", () => els.drop.classList.remove("over"));
els.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  els.drop.classList.remove("over");
  if (e.dataTransfer.files[0]) ingest(e.dataTransfer.files[0]);
});
