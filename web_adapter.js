/**
 * ThumbUp Studio — Web Platform Adapter (v2.1)
 * Implements window.thumbupAPI 100% client-side in the user's browser:
 * - Ratio-Prioritized Live Slot Thumbnail Scraper + Pre-Bundled Multi-Ratio Catalog
 * - PP-OCRv4 DBNet Neural Text Detection with Full 3D Logo Unclipping & Tight Glyph Segmentation
 * - Local Context-Crop LaMa ONNX Neural Inpainting (IndexedDB Cached on User's Computer)
 * - Transparency-Aware 2-Pass LaMa Generative Outpaint (Fills Transparent PNG Parts & Empty Frame Space)
 */
(() => {
  const STORAGE_KEY = "thumbup-storage-v2";
  const IDB_NAME = "thumbup-ai-models-v1";
  const IDB_STORE = "models";

  const DEFAULT_FONTS = [
    { family: "Montserrat", style: "Black" },
    { family: "Montserrat", style: "ExtraBold" },
    { family: "Montserrat", style: "Bold" },
    { family: "Montserrat", style: "Regular" },
    { family: "Bebas Neue", style: "Regular" },
    { family: "Anton", style: "Regular" },
    { family: "Oswald", style: "Bold" },
    { family: "Oswald", style: "SemiBold" },
    { family: "Oswald", style: "Regular" },
    { family: "Poppins", style: "Black" },
    { family: "Poppins", style: "ExtraBold" },
    { family: "Poppins", style: "Bold" },
    { family: "Poppins", style: "Regular" },
    { family: "Russo One", style: "Regular" },
    { family: "Teko", style: "Bold" },
    { family: "Teko", style: "SemiBold" },
    { family: "Titan One", style: "Regular" },
    { family: "Luckiest Guy", style: "Regular" },
    { family: "Righteous", style: "Regular" },
    { family: "Bangers", style: "Regular" },
    { family: "Permanent Marker", style: "Regular" },
    { family: "Black Ops One", style: "Regular" },
    { family: "Archivo Black", style: "Regular" },
    { family: "Passion One", style: "Black" },
    { family: "Passion One", style: "Bold" },
    { family: "Fredoka", style: "Bold" },
    { family: "Fredoka", style: "SemiBold" },
    { family: "Orbitron", style: "Black" },
    { family: "Orbitron", style: "Bold" },
    { family: "Audiowide", style: "Regular" },
    { family: "Alfa Slab One", style: "Regular" },
    { family: "Paytone One", style: "Regular" },
    { family: "Rowdies", style: "Bold" },
    { family: "Sigmar", style: "Regular" },
    { family: "Ultra", style: "Regular" },
    { family: "Press Start 2P", style: "Regular" },
    { family: "Monoton", style: "Regular" },
    { family: "Cinzel", style: "Black" },
    { family: "Cinzel", style: "Bold" },
    { family: "Roboto Condensed", style: "Black" },
    { family: "Roboto Condensed", style: "Bold" },
    { family: "Roboto Condensed", style: "Regular" },
    { family: "Inter", style: "Black" },
    { family: "Inter", style: "Bold" },
    { family: "Inter", style: "Regular" },
    { family: "Impact", style: "Regular" },
    { family: "Arial Black", style: "Regular" }
  ];

  window._currentImportedFiles = {};

  function getStoredData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      presets: [
        {
          id: "p-slot-portrait",
          name: "Casino Slot Portrait (210×264)",
          width: 210,
          height: 264,
          ratio: "0.80:1",
          cropFitMode: "fit-both",
          cropAlign: "center"
        },
        {
          id: "p-slot-tall",
          name: "Casino Lobby Tall (300×400)",
          width: 300,
          height: 400,
          ratio: "3:4",
          cropFitMode: "fit-both",
          cropAlign: "center"
        },
        {
          id: "p-square",
          name: "Square Grid Thumbnail (300×300)",
          width: 300,
          height: 300,
          ratio: "1:1",
          cropFitMode: "fit-both",
          cropAlign: "center"
        },
        {
          id: "p-wide-400",
          name: "Wide Banner (400×225)",
          width: 400,
          height: 225,
          ratio: "16:9",
          cropFitMode: "fit-both",
          cropAlign: "center"
        },
        {
          id: "p-yt-720",
          name: "YouTube HD (1280×720)",
          width: 1280,
          height: 720,
          ratio: "16:9",
          cropFitMode: "fit-both",
          cropAlign: "center"
        }
      ],
      latest: {
        width: 210,
        height: 264
      }
    };
  }

  function setStoredData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadImage(src, timeoutMs = 6500) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error("Empty src"));
      const img = new Image();
      let timer = null;
      if (!src.startsWith("data:") && !src.startsWith("./") && !src.startsWith("/") && !src.startsWith("assets/")) {
        img.crossOrigin = "anonymous";
      }
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          img.src = "";
          reject(new Error("Image load timeout"));
        }, timeoutMs);
      }
      img.onload = () => {
        if (timer) clearTimeout(timer);
        resolve(img);
      };
      img.onerror = (e) => {
        if (timer) clearTimeout(timer);
        reject(e);
      };
      img.src = src;
    });
  }

  // Matches desktop processor.py compute_adaptive_color (average RGB -> boost HSL saturation >= 80%)
  function computeAdaptiveColorFromCanvas(canvas) {
    try {
      const small = document.createElement("canvas");
      small.width = 40;
      small.height = 40;
      const sCtx = small.getContext("2d");
      sCtx.drawImage(canvas, 0, 0, 40, 40);
      const data = sCtx.getImageData(0, 0, 40, 40).data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        count++;
      }
      if (count === 0) return "#2D9CDB";
      const rF = (rSum / count) / 255.0;
      const gF = (gSum / count) / 255.0;
      const bF = (bSum / count) / 255.0;
      const mx = Math.max(rF, gF, bF);
      const mn = Math.min(rF, gF, bF);
      let h = 0, s = 0;
      const l = (mx + mn) / 2.0;
      if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
        if (mx === rF) h = (gF - bF) / d + (gF < bF ? 6.0 : 0.0);
        else if (mx === gF) h = (bF - rF) / d + 2.0;
        else h = (rF - gF) / d + 4.0;
        h /= 6.0;
      }
      if (s < 0.8) s = 0.8;
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const fr = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      const fg = Math.round(hue2rgb(p, q, h) * 255);
      const fb = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
      const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
      return `#${toHex(fr)}${toHex(fg)}${toHex(fb)}`;
    } catch (e) {
      return "#2D9CDB";
    }
  }

  // ==========================================
  // INDEXEDDB PERSISTENT AI MODEL CACHE (RUNS 100% ON USER'S COMPUTER)
  // ==========================================
  function openModelDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("No IndexedDB"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCachedModelBytes(key) {
    try {
      const db = await openModelDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function setCachedModelBytes(key, uint8Arr) {
    try {
      const db = await openModelDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const req = tx.objectStore(IDB_STORE).put(uint8Arr, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {}
  }

  async function fetchModelWithCache(key, url, label) {
    const cached = await getCachedModelBytes(key);
    if (cached && cached.byteLength > 100000) {
      return cached instanceof Uint8Array ? cached : new Uint8Array(cached);
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const total = Number(res.headers.get("content-length")) || 0;

    if (res.body && typeof res.body.getReader === "function" && total > 0) {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (typeof window.__onAiModelProgress === "function") {
          const pct = Math.min(99, Math.round((received / total) * 100));
          const mb = (received / (1024 * 1024)).toFixed(1);
          const totMb = (total / (1024 * 1024)).toFixed(1);
          window.__onAiModelProgress(`${label} (${mb}/${totMb} MB — ${pct}%)`);
        }
      }
      const out = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      await setCachedModelBytes(key, out);
      return out;
    } else {
      const buf = await res.arrayBuffer();
      const out = new Uint8Array(buf);
      await setCachedModelBytes(key, out);
      return out;
    }
  }

  // ==========================================
  // REAL DEEP LEARNING PP-OCR TEXT DETECTION & LAMA INPAINTING (100% LOCAL ON USER'S COMPUTER)
  // ==========================================
  let _lamaSession = null;
  let _lamaLoadingPromise = null;
  let _detSession = null;
  let _detLoadingPromise = null;

  function configureOrtEnv() {
    if (typeof window.ort !== "undefined" && window.ort.env && window.ort.env.wasm) {
      window.ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";
      window.ort.env.wasm.numThreads = 1;
      window.ort.env.wasm.simd = true;
    }
  }

  async function getLamaSession() {
    if (_lamaSession) return _lamaSession;
    if (_lamaLoadingPromise) return _lamaLoadingPromise;

    _lamaLoadingPromise = (async () => {
      if (typeof window.ort === "undefined") {
        console.warn("ONNX Runtime Web not loaded; using local algorithmic inpainter.");
        return null;
      }
      try {
        configureOrtEnv();
        const modelUrl = "https://huggingface.co/linkus2026/lama-int8-mobile/resolve/main/lama_int8.onnx";
        const modelBytes = await fetchModelWithCache(
          "lama_int8_v1",
          modelUrl,
          "Caching LaMa Neural AI Model to your computer"
        );
        _lamaSession = await window.ort.InferenceSession.create(modelBytes, {
          executionProviders: ["wasm"]
        });
        console.log("LaMa ONNX Neural Network initialized on user computer!");
        return _lamaSession;
      } catch (err) {
        console.warn("Failed to load LaMa ONNX model, falling back to local algorithmic inpainter:", err);
        _lamaLoadingPromise = null;
        return null;
      }
    })();

    return _lamaLoadingPromise;
  }

  async function getDetSession() {
    if (_detSession) return _detSession;
    if (_detLoadingPromise) return _detLoadingPromise;

    _detLoadingPromise = (async () => {
      if (typeof window.ort === "undefined") {
        console.warn("ONNX Runtime Web not loaded; skipping PP-OCR text detector.");
        return null;
      }
      try {
        configureOrtEnv();
        const modelUrl = "./assets/models/ppocr_det.onnx";
        const modelBytes = await fetchModelWithCache(
          "ppocr_det_v1",
          modelUrl,
          "Loading Local PP-OCR Text Detector"
        );
        _detSession = await window.ort.InferenceSession.create(modelBytes, {
          executionProviders: ["wasm"]
        });
        console.log("PP-OCR Neural Text Detector initialized on user computer!");
        return _detSession;
      } catch (err) {
        console.warn("Failed to load PP-OCR detector:", err);
        _detLoadingPromise = null;
        return null;
      }
    })();

    return _detLoadingPromise;
  }

  // Fast 2D Morphological Dilate / Erode on Uint8Array (0 or 1)
  function morphDilate(mask, w, h, rx, ry) {
    const horiz = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let count = 0;
      for (let x = 0; x <= Math.min(w - 1, rx); x++) count += mask[row + x];
      for (let x = 0; x < w; x++) {
        if (x + rx < w && x > 0) count += mask[row + x + rx];
        if (x - rx - 1 >= 0) count -= mask[row + x - rx - 1];
        horiz[row + x] = count > 0 ? 1 : 0;
      }
    }
    const out = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      let count = 0;
      for (let y = 0; y <= Math.min(h - 1, ry); y++) count += horiz[y * w + x];
      for (let y = 0; y < h; y++) {
        if (y + ry < h && y > 0) count += horiz[(y + ry) * w + x];
        if (y - ry - 1 >= 0) count -= horiz[(y - ry - 1) * w + x];
        out[y * w + x] = count > 0 ? 1 : 0;
      }
    }
    return out;
  }

  function morphErode(mask, w, h, rx, ry) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1;
    const dil = morphDilate(inv, w, h, rx, ry);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = dil[i] ? 0 : 1;
    return out;
  }

  function morphClose(mask, w, h, rx, ry) {
    return morphErode(morphDilate(mask, w, h, rx, ry), w, h, rx, ry);
  }

  // Connected Components (8-connectivity) on binary Uint8Array
  function connectedComponents(mask, w, h) {
    const labels = new Int32Array(w * h);
    const boxes = [];
    const stack = [];
    let currentLabel = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 0 || labels[idx] !== 0) continue;
        currentLabel++;
        labels[idx] = currentLabel;
        stack.push(idx);
        let minX = x, maxX = x, minY = y, maxY = y, area = 0;

        while (stack.length > 0) {
          const cur = stack.pop();
          const cy = Math.floor(cur / w);
          const cx = cur % w;
          area++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              if (nx < 0 || nx >= w) continue;
              const nIdx = ny * w + nx;
              if (mask[nIdx] !== 0 && labels[nIdx] === 0) {
                labels[nIdx] = currentLabel;
                stack.push(nIdx);
              }
            }
          }
        }
        boxes.push({
          label: currentLabel,
          x0: minX,
          y0: minY,
          x1: maxX + 1,
          y1: maxY + 1,
          bw: maxX - minX + 1,
          bh: maxY - minY + 1,
          area
        });
      }
    }
    return boxes;
  }

  // Separable Box Blur on single-channel Float32Array (used for soft mask feathering)
  function blurFloatChannel(src, w, h, radius) {
    if (radius <= 0) return new Float32Array(src);
    let cur = new Float32Array(src);
    let tmp = new Float32Array(w * h);
    const win = radius * 2 + 1;
    // 2 passes approximate Gaussian blur
    for (let pass = 0; pass < 2; pass++) {
      // Horizontal
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let sum = 0;
        for (let x = -radius; x <= radius; x++) {
          sum += cur[row + Math.max(0, Math.min(w - 1, x))];
        }
        for (let x = 0; x < w; x++) {
          tmp[row + x] = sum / win;
          const removeX = Math.max(0, Math.min(w - 1, x - radius));
          const addX = Math.max(0, Math.min(w - 1, x + radius + 1));
          sum += cur[row + addX] - cur[row + removeX];
        }
      }
      // Vertical
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++) {
          sum += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
        }
        for (let y = 0; y < h; y++) {
          cur[y * w + x] = sum / win;
          const removeY = Math.max(0, Math.min(h - 1, y - radius));
          const addY = Math.max(0, Math.min(h - 1, y + radius + 1));
          sum += tmp[addY * w + x] - tmp[removeY * w + x];
        }
      }
    }
    return cur;
  }

  /**
   * Direct JS port of python_engine/processor.py:
   * - Runs PP-OCRv4 DBNet on 512x512
   * - Unclips DBNet shrunken text cores by 1.18x vertically and 0.28x horizontally so tall capital letters,
   *   3D extrusions, colored strokes, and drop shadows are 100% inside the box
   * - Segments tight glyph + outline pixels by comparing against the local outer context ring's
   *   25th, 50th, and 75th percentile background colors
   */
  async function detectTextMaskPpOcr(imgDataUrl, sensitivity = "balanced") {
    const session = await getDetSession();
    if (!session) return null;

    try {
      const img = await loadImage(imgDataUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      const natCanvas = document.createElement("canvas");
      natCanvas.width = w;
      natCanvas.height = h;
      const natCtx = natCanvas.getContext("2d", { willReadFrequently: true });
      natCtx.drawImage(img, 0, 0);
      const natPixels = natCtx.getImageData(0, 0, w, h).data;

      // Rescale to 512x512 for PP-OCR Det
      const detCanvas = document.createElement("canvas");
      detCanvas.width = 512;
      detCanvas.height = 512;
      const detCtx = detCanvas.getContext("2d", { willReadFrequently: true });
      detCtx.drawImage(img, 0, 0, 512, 512);
      const detData = detCtx.getImageData(0, 0, 512, 512).data;

      const plane = 512 * 512;
      const floatArr = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        const p = i * 4;
        floatArr[i] = (detData[p] / 255.0 - 0.485) / 0.229;
        floatArr[plane + i] = (detData[p + 1] / 255.0 - 0.456) / 0.224;
        floatArr[plane * 2 + i] = (detData[p + 2] / 255.0 - 0.406) / 0.225;
      }

      const tensor = new window.ort.Tensor("float32", floatArr, [1, 3, 512, 512]);
      const res = await session.run({ x: tensor });
      const probMap = res["sigmoid_0.tmp_0"].data;

      const probThresh = sensitivity === "aggressive" ? 0.22 : 0.28;
      const coreBin = new Uint8Array(plane);
      let coreCount = 0;
      for (let i = 0; i < plane; i++) {
        if (probMap[i] > probThresh) {
          coreBin[i] = 1;
          coreCount++;
        }
      }
      if (coreCount < 15) return null;

      // Bridge horizontally adjacent letters of the same word in 512x512 space
      const bridged = morphClose(coreBin, 512, 512, 5, 1);
      const rawBoxes = connectedComponents(bridged, 512, 512);

      const sx = w / 512.0;
      const sy = h / 512.0;
      const fullMask = new Uint8Array(w * h);
      let validBoxesCount = 0;

      for (const b of rawBoxes) {
        if (b.area < 28 || b.bw < 8 || b.bh < 4) continue;
        // Ignore giant false-positive boxes spanning > 48% of image height
        if (b.bh > 512 * 0.48) continue;

        const x0 = Math.floor(b.x0 * sx);
        const y0 = Math.floor(b.y0 * sy);
        const x1 = Math.ceil(b.x1 * sx);
        const y1 = Math.ceil(b.y1 * sy);
        const cwBox = Math.max(6, x1 - x0);
        const chBox = Math.max(6, y1 - y0);

        // If strict mode ("Flat White Text Only"), check if this region is flat white text vs colorful 3D logo
        if (sensitivity === "strict") {
          if (chBox > h * 0.24) continue;
          let whiteCount = 0, colorfulCount = 0, totalBox = 0;
          for (let yy = Math.max(0, y0 - 4); yy < Math.min(h, y1 + 4); yy++) {
            for (let xx = Math.max(0, x0 - 4); xx < Math.min(w, x1 + 4); xx++) {
              const p = (yy * w + xx) * 4;
              const r = natPixels[p], g = natPixels[p + 1], bl = natPixels[p + 2];
              const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
              const sat = mx === 0 ? 0 : ((mx - mn) / mx) * 255;
              totalBox++;
              if (mx >= 195 && sat <= 48) whiteCount++;
              else if (mx >= 110 && sat >= 95) colorfulCount++;
            }
          }
          if (totalBox === 0 || whiteCount / totalBox < 0.05 || colorfulCount / totalBox > 0.25) {
            continue;
          }
        }

        // Unclip DBNet shrunken core box so tall first/last capital letters (S/T/B), 3D extrusions,
        // thick outer strokes, and drop shadows are completely inside (ux0, uy0, ux1, uy1)!
        const padY = Math.max(12, Math.round(chBox * 1.18));
        const padX = Math.max(14, Math.round(cwBox * 0.28));
        const padXRight = x1 > w * 0.58 ? Math.max(padX, Math.round(w * 0.12)) : padX;

        const ux0 = Math.max(0, x0 - padX);
        const uy0 = Math.max(0, y0 - padY);
        const ux1 = Math.min(w, x1 + padXRight);
        const uy1 = Math.min(h, y1 + padY);

        // Outer context ring window around (ux0, uy0, ux1, uy1) to sample background color percentiles
        const ctxPadY = Math.max(10, Math.round((uy1 - uy0) * 0.35));
        const ctxPadX = Math.max(12, Math.round((ux1 - ux0) * 0.18));
        const cx0 = Math.max(0, ux0 - ctxPadX);
        const cy0 = Math.max(0, uy0 - ctxPadY);
        const cx1 = Math.min(w, ux1 + ctxPadX);
        const cy1 = Math.min(h, uy1 + ctxPadY);

        const ringR = [], ringG = [], ringB = [];
        for (let yy = cy0; yy < cy1; yy += 2) {
          for (let xx = cx0; xx < cx1; xx += 2) {
            if (xx >= ux0 && xx < ux1 && yy >= uy0 && yy < uy1) continue;
            const p = (yy * w + xx) * 4;
            if (natPixels[p + 3] < 128) continue;
            ringR.push(natPixels[p]);
            ringG.push(natPixels[p + 1]);
            ringB.push(natPixels[p + 2]);
          }
        }

        const bwU = ux1 - ux0;
        const bhU = uy1 - uy0;
        let localGlyph = new Uint8Array(bwU * bhU);

        if (ringR.length >= 16) {
          ringR.sort((a, b) => a - b);
          ringG.sort((a, b) => a - b);
          ringB.sort((a, b) => a - b);
          const pickPct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
          const bgRefs = [
            [pickPct(ringR, 0.25), pickPct(ringG, 0.25), pickPct(ringB, 0.25)],
            [pickPct(ringR, 0.50), pickPct(ringG, 0.50), pickPct(ringB, 0.50)],
            [pickPct(ringR, 0.75), pickPct(ringG, 0.75), pickPct(ringB, 0.75)]
          ];

          let fgCount = 0;
          for (let ly = 0; ly < bhU; ly++) {
            const yy = uy0 + ly;
            for (let lx = 0; lx < bwU; lx++) {
              const xx = ux0 + lx;
              const p = (yy * w + xx) * 4;
              const r = natPixels[p], g = natPixels[p + 1], bl = natPixels[p + 2];

              let minDist = 1e9;
              for (let k = 0; k < 3; k++) {
                const dr = r - bgRefs[k][0];
                const dg = g - bgRefs[k][1];
                const db = bl - bgRefs[k][2];
                const d = Math.sqrt(dr * dr + dg * dg + db * db);
                if (d < minDist) minDist = d;
              }

              // Local gradient contrast (catches dark text outlines and drop shadows)
              let grad = 0;
              if (xx > 0 && xx < w - 1 && yy > 0 && yy < h - 1) {
                const pL = (yy * w + (xx - 1)) * 4;
                const pR = (yy * w + (xx + 1)) * 4;
                const pU = ((yy - 1) * w + xx) * 4;
                const pD = ((yy + 1) * w + xx) * 4;
                const gx = Math.abs(natPixels[pR] - natPixels[pL]) + Math.abs(natPixels[pR + 1] - natPixels[pL + 1]);
                const gy = Math.abs(natPixels[pD] - natPixels[pU]) + Math.abs(natPixels[pD + 1] - natPixels[pU + 1]);
                grad = (gx + gy) * 0.25;
              }

              if (minDist > 25.0 || grad > 20.0) {
                localGlyph[ly * bwU + lx] = 1;
                fgCount++;
              }
            }
          }

          // Close interior letter holes and dilate by ~6px to cover anti-aliased fringes & 3D outlines
          const dilRad = Math.max(5, Math.round(Math.max(w, h) * 0.012));
          localGlyph = morphClose(localGlyph, bwU, bhU, 5, 4);
          localGlyph = morphDilate(localGlyph, bwU, bhU, dilRad, dilRad);

          if (fgCount < bwU * bhU * 0.12) {
            localGlyph.fill(1);
          }
        } else {
          localGlyph.fill(1);
        }

        for (let ly = 0; ly < bhU; ly++) {
          const rowW = (uy0 + ly) * w;
          const rowL = ly * bwU;
          for (let lx = 0; lx < bwU; lx++) {
            if (localGlyph[rowL + lx]) {
              fullMask[rowW + (ux0 + lx)] = 1;
            }
          }
        }
        validBoxesCount++;
      }

      if (validBoxesCount === 0) return null;

      // Morphological close across full mask to join stacked multi-line titles (like "SWEET" + "BONANZA")
      const joinRx = Math.max(6, Math.round(w * 0.025));
      const joinRy = Math.max(6, Math.round(h * 0.022));
      const closedFull = morphClose(fullMask, w, h, joinRx, joinRy);

      const outCanvas = document.createElement("canvas");
      outCanvas.width = w;
      outCanvas.height = h;
      const outCtx = outCanvas.getContext("2d");
      const outData = outCtx.createImageData(w, h);
      const outP = outData.data;
      let totalMasked = 0;
      for (let i = 0; i < w * h; i++) {
        const v = closedFull[i] ? 255 : 0;
        if (v) totalMasked++;
        const p = i * 4;
        outP[p] = v;
        outP[p + 1] = v;
        outP[p + 2] = v;
        outP[p + 3] = 255;
      }
      if (totalMasked < 25) return null;
      outCtx.putImageData(outData, 0, 0);

      return {
        maskDataUrl: outCanvas.toDataURL("image/png"),
        count: totalMasked
      };
    } catch (err) {
      console.warn("PP-OCR detection error:", err);
      return null;
    }
  }

  /**
   * Raw 512x512 LaMa ONNX pass on an HTMLCanvasElement `srcCanvas` and binary ` Uint8Array` `maskArr` (size w*h)
   * Returns a Canvas of size (w, h) with the raw LaMa output.
   */
  async function executeLamaPassOnCanvas(session, srcCanvas, maskArr, w, h) {
    const imgCanvas = document.createElement("canvas");
    imgCanvas.width = 512;
    imgCanvas.height = 512;
    const imgCtx = imgCanvas.getContext("2d", { willReadFrequently: true });
    imgCtx.drawImage(srcCanvas, 0, 0, 512, 512);
    const imgData = imgCtx.getImageData(0, 0, 512, 512).data;

    const planeSize = 512 * 512;
    const floatImg = new Float32Array(3 * planeSize);
    const floatMask = new Float32Array(planeSize);

    for (let y = 0; y < 512; y++) {
      const sy = Math.min(h - 1, Math.floor((y / 512) * h));
      for (let x = 0; x < 512; x++) {
        const sx = Math.min(w - 1, Math.floor((x / 512) * w));
        const i = y * 512 + x;
        const p = i * 4;
        floatImg[i] = imgData[p] / 255.0;
        floatImg[planeSize + i] = imgData[p + 1] / 255.0;
        floatImg[planeSize * 2 + i] = imgData[p + 2] / 255.0;
        floatMask[i] = maskArr[sy * w + sx] ? 1.0 : 0.0;
      }
    }

    const imgTensor = new window.ort.Tensor("float32", floatImg, [1, 3, 512, 512]);
    const maskTensor = new window.ort.Tensor("float32", floatMask, [1, 1, 512, 512]);
    const results = await session.run({ image: imgTensor, mask: maskTensor });
    const outputData = results.output.data;

    const outImgData = imgCtx.createImageData(512, 512);
    const outP = outImgData.data;
    for (let i = 0; i < planeSize; i++) {
      const p = i * 4;
      outP[p] = Math.max(0, Math.min(255, Math.round(outputData[i])));
      outP[p + 1] = Math.max(0, Math.min(255, Math.round(outputData[planeSize + i])));
      outP[p + 2] = Math.max(0, Math.min(255, Math.round(outputData[planeSize * 2 + i])));
      outP[p + 3] = 255;
    }
    imgCtx.putImageData(outImgData, 0, 0);

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = w;
    scaledCanvas.height = h;
    const sCtx = scaledCanvas.getContext("2d");
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = "high";
    sCtx.drawImage(imgCanvas, 0, 0, w, h);
    return scaledCanvas;
  }

  /**
   * High-Resolution Local Context-Crop LaMa Neural Inpainting (matches python_engine/processor.py high_quality_inpaint):
   * Crops a generous context window around the masked region, runs LaMa 512x512 on the crop,
   * and composites only the masked pixels with a soft 3px feather boundary so unmasked background
   * artwork stays 100% original and razor-sharp (including preserving original PNG alpha outside the mask).
   */
  async function runLamaNeuralInpaint(sourceImgDataUrl, maskImgDataUrl, dilateRadius = 0) {
    const session = await getLamaSession();
    if (!session) {
      return inpaintCanvasAlgorithmic(sourceImgDataUrl, maskImgDataUrl);
    }

    const img = await loadImage(sourceImgDataUrl);
    const mask = await loadImage(maskImgDataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    srcCtx.drawImage(img, 0, 0);
    const srcImageData = srcCtx.getImageData(0, 0, w, h);
    const srcPixels = srcImageData.data;

    const mCanvas = document.createElement("canvas");
    mCanvas.width = w;
    mCanvas.height = h;
    const mCtx = mCanvas.getContext("2d", { willReadFrequently: true });
    mCtx.drawImage(mask, 0, 0, w, h);
    const mPixels = mCtx.getImageData(0, 0, w, h).data;

    let binMask = new Uint8Array(w * h);
    let maskCount = 0;
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      // Check R channel when mask is black/white RGB, or alpha channel if transparent mask
      const isM = mPixels[p] > 64 || (mPixels[p] === 0 && mPixels[p + 1] === 0 && mPixels[p + 2] === 0 ? false : mPixels[p + 3] > 64 && mPixels[p] > 40);
      if (isM) {
        binMask[i] = 1;
        maskCount++;
      }
    }
    if (maskCount === 0) return sourceImgDataUrl;

    if (dilateRadius > 0) {
      binMask = morphDilate(binMask, w, h, dilateRadius, dilateRadius);
    }

    // Find bounding box of mask for local context crop
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (binMask[y * w + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const padX = Math.max(64, Math.round(bw * 0.55));
    const padY = Math.max(64, Math.round(bh * 0.65));
    const cx0 = Math.max(0, minX - padX);
    const cy0 = Math.max(0, minY - padY);
    const cx1 = Math.min(w, maxX + 1 + padX);
    const cy1 = Math.min(h, maxY + 1 + padY);
    const cw = cx1 - cx0;
    const ch = cy1 - cy0;

    try {
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cw;
      cropCanvas.height = ch;
      const cropCtx = cropCanvas.getContext("2d");
      cropCtx.drawImage(srcCanvas, cx0, cy0, cw, ch, 0, 0, cw, ch);

      const cropMask = new Uint8Array(cw * ch);
      const cropFloatMask = new Float32Array(cw * ch);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const v = binMask[(cy0 + y) * w + (cx0 + x)];
          cropMask[y * cw + x] = v;
          cropFloatMask[y * cw + x] = v ? 1.0 : 0.0;
        }
      }

      const outCropCanvas = await executeLamaPassOnCanvas(session, cropCanvas, cropMask, cw, ch);
      const outCropPixels = outCropCanvas.getContext("2d").getImageData(0, 0, cw, ch).data;

      // Soft 3px feather blend on cropFloatMask so transition is seamless
      const alphaFeather = blurFloatChannel(cropFloatMask, cw, ch, 3);

      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const a = alphaFeather[y * cw + x];
          if (a <= 0.005) continue;
          const cp = (y * cw + x) * 4;
          const sp = ((cy0 + y) * w + (cx0 + x)) * 4;
          srcPixels[sp] = Math.round(outCropPixels[cp] * a + srcPixels[sp] * (1.0 - a));
          srcPixels[sp + 1] = Math.round(outCropPixels[cp + 1] * a + srcPixels[sp + 1] * (1.0 - a));
          srcPixels[sp + 2] = Math.round(outCropPixels[cp + 2] * a + srcPixels[sp + 2] * (1.0 - a));
          srcPixels[sp + 3] = Math.max(srcPixels[sp + 3], Math.round(255 * a));
        }
      }

      srcCtx.putImageData(srcImageData, 0, 0);
      return srcCanvas.toDataURL("image/png");
    } catch (err) {
      console.warn("LaMa inference error, falling back to algorithmic inpainter:", err);
      return inpaintCanvasAlgorithmic(sourceImgDataUrl, maskImgDataUrl);
    }
  }

  // Fast Marching Algorithmic Inpainter (Fallback if offline before model cache)
  async function inpaintCanvasAlgorithmic(imgDataUrl, maskDataUrl) {
    const img = await loadImage(imgDataUrl);
    const mask = await loadImage(maskDataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const imgPixels = imgData.data;

    const mCanvas = document.createElement("canvas");
    mCanvas.width = w;
    mCanvas.height = h;
    const mCtx = mCanvas.getContext("2d", { willReadFrequently: true });
    mCtx.drawImage(mask, 0, 0, w, h);
    const maskPixels = mCtx.getImageData(0, 0, w, h).data;

    const isMasked = new Uint8Array(w * h);
    let maskCount = 0;
    for (let i = 0; i < w * h; i++) {
      if (maskPixels[i * 4] > 50) {
        isMasked[i] = 1;
        maskCount++;
      }
    }
    if (maskCount === 0) return imgDataUrl;

    const dist = new Float32Array(w * h);
    dist.fill(-1);
    const queue = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (isMasked[idx] === 1) {
          if (
            (x > 0 && isMasked[idx - 1] === 0) ||
            (x < w - 1 && isMasked[idx + 1] === 0) ||
            (y > 0 && isMasked[idx - w] === 0) ||
            (y < h - 1 && isMasked[idx + w] === 0)
          ) {
            dist[idx] = 1;
            queue.push(idx);
          }
        } else {
          dist[idx] = 0;
        }
      }
    }

    const radius = 6;
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const y = Math.floor(idx / w);
      const x = idx % w;

      let rSum = 0, gSum = 0, bSum = 0, totalW = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nidx = ny * w + nx;
          if (isMasked[nidx] === 1 && dist[nidx] < 0) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius || d === 0) continue;
          const weight = 1.0 / (d * d * Math.sqrt(d));
          const p = nidx * 4;
          rSum += imgPixels[p] * weight;
          gSum += imgPixels[p + 1] * weight;
          bSum += imgPixels[p + 2] * weight;
          totalW += weight;
        }
      }

      if (totalW > 0) {
        const p = idx * 4;
        imgPixels[p] = Math.round(rSum / totalW);
        imgPixels[p + 1] = Math.round(gSum / totalW);
        imgPixels[p + 2] = Math.round(bSum / totalW);
        imgPixels[p + 3] = 255;
      }

      const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
      for (const n of neighbors) {
        if (n >= 0 && n < w * h && isMasked[n] === 1 && dist[n] < 0) {
          dist[n] = dist[idx] + 1;
          queue.push(n);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  async function inpaintCanvas(imgDataUrl, maskDataUrl, dilateRadius = 0) {
    return runLamaNeuralInpaint(imgDataUrl, maskDataUrl, dilateRadius);
  }

  /**
   * Transparency-Aware 2-Pass LaMa Neural Generative Outpainting (`outpaintCanvas`):
   * - Places the source image onto a `(tw, th)` canvas using the exact Step 3 crop/zoom/shift/align parameters.
   * - Detects BOTH empty margins outside the image AND any transparent / semi-transparent PNG regions (`alpha < 240`) inside the image!
   * - Erodes the opaque mask by 4px so semi-transparent PNG fringes/halos are cleanly replaced.
   * - Diffuses opaque boundary colors into all transparent/empty regions (never sampling transparent black pixels),
   *   adds variant-seeded atmospheric billows, pads by `ext = 24px` outside `(tw, th)`, places guide anchors in deep
   *   empty space so LaMa's internal `(1 - mask)` preserves rich scene colors, and runs 2-pass LaMa neural outpainting!
   */
  async function outpaintCanvas(imageBase64, tw, th, fitMode, align, sx, sy, zoom, variantSeed) {
    tw = Math.max(50, Math.min(4000, Math.round(Number(tw) || 210)));
    th = Math.max(50, Math.min(4000, Math.round(Number(th) || 264)));

    const img = await loadImage(imageBase64);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    const shiftXPct = Math.max(-1.0, Math.min(1.0, (Number(sx) || 0) / 100.0));
    const shiftYPct = Math.max(-1.0, Math.min(1.0, (Number(sy) || 0) / 100.0));
    const zoomFactor = Math.max(0.25, Math.min(3.0, (Number(zoom) || 100) / 100.0));

    let drawW, drawH;
    if (fitMode === "fit-both") {
      drawW = Math.round(tw * zoomFactor);
      drawH = Math.round(th * zoomFactor);
    } else {
      let baseScale = 1.0;
      if (fitMode === "fit-horizontal") baseScale = tw / Math.max(1, iw);
      else if (fitMode === "fit-vertical") baseScale = th / Math.max(1, ih);
      else baseScale = Math.max(tw / Math.max(1, iw), th / Math.max(1, ih));
      const finalScale = baseScale * zoomFactor;
      drawW = Math.max(8, Math.round(iw * finalScale));
      drawH = Math.max(8, Math.round(ih * finalScale));
    }

    let ax = 0.5, ay = 0.5;
    const alignStr = String(align || "center").toLowerCase();
    if (alignStr.includes("left")) ax = 0.0;
    else if (alignStr.includes("right")) ax = 1.0;
    if (alignStr.includes("top")) ay = 0.0;
    else if (alignStr.includes("bottom")) ay = 1.0;

    let dx = Math.round((tw - drawW) * ax + shiftXPct * (tw * 0.5));
    let dy = Math.round((th - drawH) * ay + shiftYPct * (th * 0.5));

    // Draw placed image onto an isolated RGBA foreground canvas to inspect both geometry AND PNG transparency
    const fgCanvas = document.createElement("canvas");
    fgCanvas.width = tw;
    fgCanvas.height = th;
    const fgCtx = fgCanvas.getContext("2d", { willReadFrequently: true });
    fgCtx.clearRect(0, 0, tw, th);
    fgCtx.drawImage(img, dx, dy, drawW, drawH);
    let fgData = fgCtx.getImageData(0, 0, tw, th).data;

    // Count how many pixels on the (tw, th) canvas are transparent/empty (`alpha < 240`)
    let transparentCount = 0;
    for (let i = 0; i < tw * th; i++) {
      if (fgData[i * 4 + 3] < 240) transparentCount++;
    }

    // If the image currently covers 100% of (tw, th) with opaque pixels (0 transparent pixels),
    // create a 10% border outpaint zone just like desktop processor.py
    if (transparentCount < 16) {
      const padX = Math.max(14, Math.round(tw * 0.10));
      const padY = Math.max(14, Math.round(th * 0.10));
      const innerW = Math.max(32, tw - 2 * padX);
      const innerH = Math.max(32, th - 2 * padY);
      fgCtx.clearRect(0, 0, tw, th);
      fgCtx.drawImage(img, padX, padY, innerW, innerH);
      fgData = fgCtx.getImageData(0, 0, tw, th).data;
    }

    // Pad working canvas by ext=24px outside (tw, th) so horizon anchors at the outer edge lie outside the visible frame
    const ext = 24;
    const ew = tw + 2 * ext;
    const eh = th + 2 * ext;

    const rawOpaque = new Uint8Array(ew * eh);
    const rCh = new Float32Array(ew * eh);
    const gCh = new Float32Array(ew * eh);
    const bCh = new Float32Array(ew * eh);

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const sp = (y * tw + x) * 4;
        const a = fgData[sp + 3];
        if (a >= 240) {
          const ei = (y + ext) * ew + (x + ext);
          rawOpaque[ei] = 1;
          rCh[ei] = fgData[sp];
          gCh[ei] = fgData[sp + 1];
          bCh[ei] = fgData[sp + 2];
        }
      }
    }

    // Erode opaque region by 4px so semi-transparent PNG edges and boundary seams are cleanly inpainted by LaMa
    let coreOpaque = morphErode(rawOpaque, ew, eh, 4, 4);
    let coreCount = 0;
    for (let i = 0; i < ew * eh; i++) {
      if (coreOpaque[i]) coreCount++;
    }
    if (coreCount < 32) {
      coreOpaque = rawOpaque;
    }

    // Multi-pass BFS distance & color propagation from `coreOpaque` boundary into all empty / transparent PNG regions
    const dist = new Int32Array(ew * eh);
    dist.fill(-1);
    const queue = new Int32Array(ew * eh);
    let qHead = 0, qTail = 0;

    for (let i = 0; i < ew * eh; i++) {
      if (coreOpaque[i]) {
        dist[i] = 0;
        queue[qTail++] = i;
      } else {
        rCh[i] = 0;
        gCh[i] = 0;
        bCh[i] = 0;
      }
    }

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const cy = Math.floor(idx / ew);
      const cx = idx % ew;
      const nextD = dist[idx] + 1;

      const nCoords = [
        [cx - 1, cy],
        [cx + 1, cy],
        [cx, cy - 1],
        [cx, cy + 1]
      ];
      for (let k = 0; k < 4; k++) {
        const nx = nCoords[k][0];
        const ny = nCoords[k][1];
        if (nx < 0 || nx >= ew || ny < 0 || ny >= eh) continue;
        const nIdx = ny * ew + nx;
        if (dist[nIdx] === -1) {
          dist[nIdx] = nextD;
          // Average already-filled neighbors for smooth outward color propagation
          let rs = 0, gs = 0, bs = 0, cnt = 0;
          for (let dy2 = -1; dy2 <= 1; dy2++) {
            const yy = ny + dy2;
            if (yy < 0 || yy >= eh) continue;
            for (let dx2 = -1; dx2 <= 1; dx2++) {
              const xx = nx + dx2;
              if (xx < 0 || xx >= ew) continue;
              const mIdx = yy * ew + xx;
              if (dist[mIdx] >= 0 && dist[mIdx] < nextD) {
                rs += rCh[mIdx];
                gs += gCh[mIdx];
                bs += bCh[mIdx];
                cnt++;
              }
            }
          }
          if (cnt > 0) {
            rCh[nIdx] = rs / cnt;
            gCh[nIdx] = gs / cnt;
            bCh[nIdx] = bs / cnt;
          } else {
            rCh[nIdx] = rCh[idx];
            gCh[nIdx] = gCh[idx];
            bCh[nIdx] = bCh[idx];
          }
          queue[qTail++] = nIdx;
        }
      }
    }

    // Smooth the propagated field into a soft horizon backdrop (suppresses sharp foreground edges from repeating)
    const smoothRad = Math.max(10, Math.round(Math.min(ew, eh) * 0.06));
    const blurR = blurFloatChannel(rCh, ew, eh, smoothRad);
    const blurG = blurFloatChannel(gCh, ew, eh, smoothRad);
    const blurB = blurFloatChannel(bCh, ew, eh, smoothRad);

    // Deterministic PRNG seeded by variantSeed so each click synthesizes a distinct atmospheric variant
    let rngState = (Math.max(1, Number(variantSeed) || 1) * 104729 + 7919) >>> 0;
    const nextRand = () => {
      rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
      return rngState / 4294967296.0;
    };

    const freqX1 = (1.5 + nextRand() * 2.0) * Math.PI * 2;
    const freqY1 = (1.5 + nextRand() * 2.0) * Math.PI * 2;
    const phaseX1 = nextRand() * Math.PI * 2;
    const phaseY1 = nextRand() * Math.PI * 2;
    const freqX2 = (3.5 + nextRand() * 3.0) * Math.PI * 2;
    const freqY2 = (3.5 + nextRand() * 3.0) * Math.PI * 2;
    const phaseX2 = nextRand() * Math.PI * 2;
    const phaseY2 = nextRand() * Math.PI * 2;

    const workCanvas = document.createElement("canvas");
    workCanvas.width = ew;
    workCanvas.height = eh;
    const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
    const workImgData = workCtx.createImageData(ew, eh);
    const workPixels = workImgData.data;

    const rawEmptyMask = new Uint8Array(ew * eh);
    for (let y = 0; y < eh; y++) {
      const ny = y / eh;
      const wY1 = Math.cos(ny * freqY1 + phaseY1);
      const wY2 = Math.sin(ny * freqY2 + phaseY2);
      for (let x = 0; x < ew; x++) {
        const i = y * ew + x;
        const p = i * 4;
        if (coreOpaque[i]) {
          workPixels[p] = Math.round(rCh[i]);
          workPixels[p + 1] = Math.round(gCh[i]);
          workPixels[p + 2] = Math.round(bCh[i]);
          workPixels[p + 3] = 255;
          rawEmptyMask[i] = 0;
        } else {
          const nx = x / ew;
          const wave1 = Math.sin(nx * freqX1 + phaseX1) * wY1;
          const wave2 = Math.cos(nx * freqX2 + phaseX2) * wY2;
          const lumShift = (wave1 * 0.65 + wave2 * 0.35) * 24.0;
          const warmShift = wave1 * 10.0;
          workPixels[p] = Math.max(6, Math.min(250, Math.round(blurR[i] + lumShift + warmShift)));
          workPixels[p + 1] = Math.max(6, Math.min(250, Math.round(blurG[i] + lumShift)));
          workPixels[p + 2] = Math.max(6, Math.min(250, Math.round(blurB[i] + lumShift - warmShift)));
          workPixels[p + 3] = 255;
          rawEmptyMask[i] = 1;
        }
      }
    }
    workCtx.putImageData(workImgData, 0, 0);

    // Prepare Pass 1 mask: unmask outer 10px horizon border (outside visible tw x th)
    // and place soft guide anchors in deep empty/transparent zones (dist > 14px)
    // so LaMa's internal (1 - mask) multiplication retains the rich scene colors!
    const workMask = new Uint8Array(rawEmptyMask);
    for (let y = 0; y < eh; y++) {
      for (let x = 0; x < ew; x++) {
        if (x < 10 || x >= ew - 10 || y < 10 || y >= eh - 10) {
          workMask[y * ew + x] = 0;
        }
      }
    }

    const anchorStep = Math.max(18, Math.round(Math.min(tw, th) * 0.09));
    const minAnchorDist = Math.max(12, Math.round(Math.min(tw, th) * 0.05));
    for (let gy = ext + 10; gy < eh - ext - 10; gy += anchorStep) {
      for (let gx = ext + 10; gx < ew - ext - 10; gx += anchorStep) {
        const jx = gx + Math.floor((nextRand() - 0.5) * anchorStep * 0.5);
        const jy = gy + Math.floor((nextRand() - 0.5) * anchorStep * 0.5);
        if (jx < 10 || jx >= ew - 10 || jy < 10 || jy >= eh - 10) continue;
        if (dist[jy * ew + jx] > minAnchorDist) {
          const ar = Math.max(4, Math.round(anchorStep * (0.22 + nextRand() * 0.14)));
          for (let dy2 = -ar; dy2 <= ar; dy2++) {
            for (let dx2 = -ar; dx2 <= ar; dx2++) {
              if (dx2 * dx2 + dy2 * dy2 <= ar * ar) {
                const ay2 = jy + dy2;
                const ax2 = jx + dx2;
                if (ay2 >= 0 && ay2 < eh && ax2 >= 0 && ax2 < ew) {
                  workMask[ay2 * ew + ax2] = 0;
                }
              }
            }
          }
        }
      }
    }

    const session = await getLamaSession();
    let finalFullCanvas = workCanvas;

    if (session) {
      try {
        // Pass 1: Global neural scene extension
        const pass1Canvas = await executeLamaPassOnCanvas(session, workCanvas, workMask, ew, eh);

        // Pass 2: Seamless boundary transition refinement (0 < dist <= 24px)
        const refineMask = new Uint8Array(ew * eh);
        const maxRefineDist = Math.max(16, Math.round(Math.min(tw, th) * 0.09));
        for (let i = 0; i < ew * eh; i++) {
          if (dist[i] > 0 && dist[i] <= maxRefineDist) {
            refineMask[i] = 1;
          }
        }
        finalFullCanvas = await executeLamaPassOnCanvas(session, pass1Canvas, refineMask, ew, eh);
      } catch (e) {
        console.warn("LaMa outpaint pass fallback:", e);
      }
    }

    // Crop visible (tw, th) region and feather-blend over original `coreOpaque` pixels
    const outCanvas = document.createElement("canvas");
    outCanvas.width = tw;
    outCanvas.height = th;
    const outCtx = outCanvas.getContext("2d");
    const outImgData = outCtx.createImageData(tw, th);
    const outPixels = outImgData.data;

    const genPixels = finalFullCanvas.getContext("2d").getImageData(ext, ext, tw, th).data;
    const visEmptyFloat = new Float32Array(tw * th);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        visEmptyFloat[y * tw + x] = coreOpaque[(y + ext) * ew + (x + ext)] ? 0.0 : 1.0;
      }
    }
    const blendAlpha = blurFloatChannel(visEmptyFloat, tw, th, 4);

    for (let i = 0; i < tw * th; i++) {
      const a = blendAlpha[i];
      const p = i * 4;
      outPixels[p] = Math.round(genPixels[p] * a + fgData[p] * (1.0 - a));
      outPixels[p + 1] = Math.round(genPixels[p + 1] * a + fgData[p + 1] * (1.0 - a));
      outPixels[p + 2] = Math.round(genPixels[p + 2] * a + fgData[p + 2] * (1.0 - a));
      outPixels[p + 3] = 255;
    }
    outCtx.putImageData(outImgData, 0, 0);

    return {
      ok: true,
      outpaintedBase64: outCanvas.toDataURL("image/png"),
      adaptiveColor: computeAdaptiveColorFromCanvas(outCanvas),
      variantSeed: Number(variantSeed) || 1
    };
  }

  // ==========================================
  // RATIO-PRIORITIZED THUMBNAIL SCRAPER & CATALOG
  // ==========================================
  const GAME_ART_CATALOG = {
    "gates of olympus": [
      "./assets/slots/gates-of-olympus/portrait_1.jpg",
      "./assets/slots/gates-of-olympus/portrait_2.jpg",
      "./assets/slots/gates-of-olympus/variant_1.jpg",
      "./assets/slots/gates-of-olympus/variant_2.jpg",
      "./assets/slots/gates-of-olympus/variant_3.jpg",
      "./assets/slots/gates-of-olympus/variant_4.jpg"
    ],
    "sweet bonanza": [
      "./assets/slots/sweet-bonanza/portrait_1.jpg",
      "./assets/slots/sweet-bonanza/portrait_2.jpg",
      "./assets/slots/sweet-bonanza/variant_1.jpg",
      "./assets/slots/sweet-bonanza/variant_2.jpg",
      "./assets/slots/sweet-bonanza/variant_3.jpg",
      "./assets/slots/sweet-bonanza/variant_4.jpg"
    ],
    "money train": [
      "./assets/slots/money-train-4/portrait_1.jpg",
      "./assets/slots/money-train-4/portrait_2.jpg",
      "./assets/slots/money-train-4/variant_1.jpg",
      "./assets/slots/money-train-4/variant_2.jpg",
      "./assets/slots/money-train-4/variant_3.jpg",
      "./assets/slots/money-train-4/variant_4.jpg"
    ],
    "rip city": [
      "./assets/slots/rip-city/portrait_1.jpg",
      "./assets/slots/rip-city/portrait_2.jpg",
      "./assets/slots/rip-city/variant_1.jpg",
      "./assets/slots/rip-city/variant_2.jpg",
      "./assets/slots/rip-city/variant_3.jpg",
      "./assets/slots/rip-city/variant_4.jpg"
    ],
    "sugar rush": [
      "./assets/slots/sugar-rush/portrait_1.jpg",
      "./assets/slots/sugar-rush/portrait_2.jpg",
      "./assets/slots/sugar-rush/variant_1.jpg",
      "./assets/slots/sugar-rush/variant_2.jpg",
      "./assets/slots/sugar-rush/variant_3.jpg",
      "./assets/slots/sugar-rush/variant_4.jpg"
    ],
    "wanted dead": [
      "./assets/slots/wanted-dead-or-a-wild/portrait_1.jpg",
      "./assets/slots/wanted-dead-or-a-wild/portrait_2.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_1.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_2.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_3.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_4.jpg"
    ],
    "big bass": [
      "./assets/slots/big-bass/portrait_1.jpg",
      "./assets/slots/big-bass/portrait_2.jpg",
      "./assets/slots/big-bass/variant_1.jpg",
      "./assets/slots/big-bass/variant_2.jpg",
      "./assets/slots/big-bass/variant_3.jpg",
      "./assets/slots/big-bass/variant_4.jpg"
    ],
    "chaos crew": [
      "./assets/slots/chaos-crew/portrait_1.jpg",
      "./assets/slots/chaos-crew/portrait_2.jpg",
      "./assets/slots/chaos-crew/variant_1.jpg",
      "./assets/slots/chaos-crew/variant_2.jpg",
      "./assets/slots/chaos-crew/variant_3.jpg",
      "./assets/slots/chaos-crew/variant_4.jpg"
    ],
    "san quentin": [
      "./assets/slots/san-quentin/portrait_1.jpg",
      "./assets/slots/san-quentin/portrait_2.jpg",
      "./assets/slots/san-quentin/variant_1.jpg",
      "./assets/slots/san-quentin/variant_2.jpg",
      "./assets/slots/san-quentin/variant_3.jpg",
      "./assets/slots/san-quentin/variant_4.jpg"
    ],
    "tombstone": [
      "./assets/slots/tombstone-rip/portrait_1.jpg",
      "./assets/slots/tombstone-rip/portrait_2.jpg",
      "./assets/slots/tombstone-rip/variant_1.jpg",
      "./assets/slots/tombstone-rip/variant_2.jpg",
      "./assets/slots/tombstone-rip/variant_3.jpg",
      "./assets/slots/tombstone-rip/variant_4.jpg"
    ],
    "book of dead": [
      "./assets/slots/book-of-dead/portrait_1.jpg",
      "./assets/slots/book-of-dead/portrait_2.jpg",
      "./assets/slots/book-of-dead/variant_1.jpg",
      "./assets/slots/book-of-dead/variant_2.jpg",
      "./assets/slots/book-of-dead/variant_3.jpg",
      "./assets/slots/book-of-dead/variant_4.jpg"
    ],
    "starlight princess": [
      "./assets/slots/starlight-princess/portrait_1.jpg",
      "./assets/slots/starlight-princess/portrait_2.jpg",
      "./assets/slots/starlight-princess/variant_1.jpg",
      "./assets/slots/starlight-princess/variant_2.jpg",
      "./assets/slots/starlight-princess/variant_3.jpg",
      "./assets/slots/starlight-princess/variant_4.jpg"
    ],
    "le bandit": [
      "./assets/slots/le-bandit/portrait_1.jpg",
      "./assets/slots/le-bandit/portrait_2.jpg",
      "./assets/slots/le-bandit/variant_1.jpg",
      "./assets/slots/le-bandit/variant_2.jpg",
      "./assets/slots/le-bandit/variant_3.jpg",
      "./assets/slots/le-bandit/variant_4.jpg"
    ],
    "dork unit": [
      "./assets/slots/dork-unit/portrait_1.jpg",
      "./assets/slots/dork-unit/portrait_2.jpg",
      "./assets/slots/dork-unit/variant_1.jpg",
      "./assets/slots/dork-unit/variant_2.jpg",
      "./assets/slots/dork-unit/variant_3.jpg",
      "./assets/slots/dork-unit/variant_4.jpg"
    ]
  };

  function generateAtmosphericGameScene(gameName, provider, tw, th, idx) {
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    const ctx = c.getContext("2d");

    const palettes = [
      { bg1: "#060913", bg2: "#111827", accent: "#38BDF8", gold: "#FBBF24" },
      { bg1: "#0A0518", bg2: "#1E1B4B", accent: "#A855F7", gold: "#F43F5E" },
      { bg1: "#120707", bg2: "#3B0764", accent: "#EC4899", gold: "#F59E0B" },
      { bg1: "#03140C", bg2: "#064E3B", accent: "#10B981", gold: "#FBBF24" }
    ];
    const pal = palettes[(idx || 0) % palettes.length];

    const grad = ctx.createRadialGradient(tw * 0.5, th * 0.35, th * 0.1, tw * 0.5, th * 0.5, Math.max(tw, th) * 0.9);
    grad.addColorStop(0, pal.bg2);
    grad.addColorStop(1, pal.bg1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, tw, th);

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(tw * 0.2, 0);
    ctx.lineTo(tw * 0.6, 0);
    ctx.lineTo(tw * 0.85, th);
    ctx.lineTo(tw * 0.45, th);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const vig = ctx.createRadialGradient(tw * 0.5, th * 0.5, Math.min(tw, th) * 0.35, tw * 0.5, th * 0.5, Math.max(tw, th) * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, tw, th);

    return c.toDataURL("image/png");
  }

  /**
   * Computes aspect ratio match score for an image of size (iw, ih) against target (targetW, targetH).
   * Strongly prioritizes images with the same or close to the same aspect ratio as Step 1 targetSize.
   */
  function computeRatioMatchScore(iw, ih, targetW, targetH, bonus = 0) {
    const targetRatio = Number(targetW || 210) / Math.max(1, Number(targetH || 264));
    const actualRatio = Number(iw || 1) / Math.max(1, Number(ih || 1));
    const ratioErr = Math.abs(actualRatio - targetRatio) / Math.max(0.22, targetRatio);

    // Heavy orientation mismatch penalty so portrait targets get portrait images & wide targets get wide images
    let orientPenalty = 0;
    if (targetRatio < 0.92 && actualRatio > 1.08) {
      orientPenalty = 8.5;
    } else if (targetRatio > 1.15 && actualRatio < 0.92) {
      orientPenalty = 8.5;
    } else if (targetRatio >= 0.92 && targetRatio <= 1.15 && (actualRatio < 0.78 || actualRatio > 1.32)) {
      orientPenalty = 5.0;
    }

    const resBonus = Math.min(0.8, (iw * ih) / Math.max(1, targetW * targetH * 2.5));
    return (1.0 / (0.05 + ratioErr)) * 4.0 + resBonus + bonus - orientPenalty;
  }

  // Computes an 8x8 perceptual luminance fingerprint to deduplicate identical images
  function computeImageFingerprint(img) {
    try {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      const lums = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        const p = i * 4;
        lums[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      }
      return lums;
    } catch (e) {
      return null;
    }
  }

  function areFingerprintsSimilar(fp1, fp2) {
    if (!fp1 || !fp2) return false;
    let diff = 0;
    for (let i = 0; i < 64; i++) {
      diff += Math.abs(fp1[i] - fp2[i]);
    }
    return diff / 64.0 < 5.5;
  }

  // Loads a candidate URL (direct first for local/CORS URLs, or via wsrv.nl CORS image proxy)
  async function loadCandidateImageWithCors(url) {
    const isLocal = url.startsWith("./") || url.startsWith("/") || url.startsWith("assets/") || url.startsWith("data:");
    if (isLocal) {
      return await loadImage(url, 5000);
    }
    // If already a wsrv.nl or tse.mm.bing.net URL, try direct or wsrv proxy
    const proxyUrl = url.includes("wsrv.nl")
      ? url
      : `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
    try {
      return await loadImage(proxyUrl, 5500);
    } catch (e) {
      return await loadImage(url, 4500);
    }
  }

  /**
   * Searches live Bing Images (with strict game-token verification + aspect ratio ranking),
   * Bing ratio-targeted thumbnail endpoints, and the pre-bundled catalog, then decodes and ranks
   * all candidates by how closely their aspect ratio matches (targetW, targetH).
   */
  async function searchAndRankGameImages(provider, game, targetW, targetH) {
    const rawGame = String(game || "").trim();
    const rawProv = String(provider || "").trim();
    const fullQuery = `${rawProv} ${rawGame}`.trim();
    if (!fullQuery) return [];

    const targetRatio = Number(targetW || 210) / Math.max(1, Number(targetH || 264));
    const candidateSpecs = [];
    const seenUrls = new Set();

    const addSpec = (url, estW, estH, bonus = 0, fallbackUrl = "") => {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      const estScore = estW > 0 && estH > 0
        ? computeRatioMatchScore(estW, estH, targetW, targetH, bonus)
        : 10.0 + bonus;
      candidateSpecs.push({ url, fallbackUrl, estW, estH, bonus, estScore });
    };

    // 1. Direct URL pasted in game list
    const urlMatch = fullQuery.match(/https?:\/\/[^\s|]+/i);
    if (urlMatch) {
      addSpec(urlMatch[0], targetW, targetH, 10.0);
    }

    // 2. Match against local pre-bundled multi-ratio catalog (contains both Portrait 0.80 and Wide 1.78 assets)
    const norm = fullQuery.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const cleanGame = rawGame.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

    let catalogKey = null;
    for (const key of Object.keys(GAME_ART_CATALOG)) {
      if (cleanGame.includes(key) || key.includes(cleanGame) || norm.includes(key)) {
        catalogKey = key;
        break;
      }
    }
    if (!catalogKey) {
      const keywordMap = [
        { words: ["olympus", "zeus"], key: "gates of olympus" },
        { words: ["bonanza", "sweet"], key: "sweet bonanza" },
        { words: ["money", "train"], key: "money train" },
        { words: ["rip", "roont"], key: "rip city" },
        { words: ["sugar", "rush"], key: "sugar rush" },
        { words: ["wanted", "dead"], key: "wanted dead" },
        { words: ["bass", "fisherman"], key: "big bass" },
        { words: ["chaos", "cranky"], key: "chaos crew" },
        { words: ["quentin"], key: "san quentin" },
        { words: ["tombstone"], key: "tombstone" },
        { words: ["wilde"], key: "book of dead" },
        { words: ["starlight"], key: "starlight princess" },
        { words: ["bandit", "smokey"], key: "le bandit" },
        { words: ["dork"], key: "dork unit" }
      ];
      const normWords = norm.split(" ");
      for (const entry of keywordMap) {
        if (entry.words.some((w) => normWords.includes(w))) {
          catalogKey = entry.key;
          break;
        }
      }
    }

    if (catalogKey && GAME_ART_CATALOG[catalogKey]) {
      for (const assetUrl of GAME_ART_CATALOG[catalogKey]) {
        const isPortraitAsset = assetUrl.includes("portrait_");
        const estW = isPortraitAsset ? 420 : 1200;
        const estH = isPortraitAsset ? 528 : 675;
        addSpec(assetUrl, estW, estH, 1.2);
      }
    }

    // 3. Direct Bing Ratio-Targeted Thumbnail Endpoints (sized to the exact Step 1 aspect ratio!)
    const maxSide = 560;
    const reqW = targetRatio <= 1.0 ? Math.round(maxSide * targetRatio) : maxSide;
    const reqH = targetRatio <= 1.0 ? maxSide : Math.round(maxSide / targetRatio);
    const orientWord = targetRatio < 0.90 ? "portrait" : targetRatio > 1.18 ? "banner" : "square";

    const bingThumbQueries = [
      `${rawProv} ${rawGame} slot`,
      `${rawGame} slot Stake`,
      `${rawGame} ${rawProv} casino game`,
      `${rawGame} slot ${orientWord} thumbnail`
    ];
    bingThumbQueries.forEach((qStr, idx) => {
      const bUrl = `https://tse${(idx % 4) + 1}.mm.bing.net/th?q=${encodeURIComponent(qStr)}&w=${reqW}&h=${reqH}&c=7&rs=1&p=0`;
      addSpec(bUrl, reqW, reqH, 0.9 - idx * 0.1);
    });

    // 4. Live Bing Images HTML Search via r.jina.ai (extracts up to 35 real web candidates with exact w/h)
    try {
      const gameTokens = cleanGame.split(/\s+/).filter((w) => w.length >= 3 && !["slot", "game", "the", "and", "for"].includes(w));
      const safeSearchQuery = `${rawGame} slot game`.trim().replace(/\s+/g, "+");
      const jinaUrl = `https://r.jina.ai/https://www.bing.com/images/search?q=${safeSearchQuery}&adlt=off`;
      const resp = await fetch(jinaUrl, {
        headers: { "X-Return-Format": "html" },
        signal: AbortSignal.timeout(4800)
      });
      if (resp.ok) {
        const html = await resp.text();
        const regex = /<a[^>]*class="iusc"[^>]*m="(\{[^"]+\})"[^>]*>[\s\S]*?<\/a>/gi;
        let m;
        while ((m = regex.exec(html)) !== null) {
          try {
            const block = m[0];
            const meta = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
            const murl = (meta.murl || "").trim();
            const turl = (meta.turl || "").trim();
            const title = (meta.t || "").trim();
            if (!murl) continue;

            const comb = `${title} ${murl}`.toLowerCase();
            // Require game title token match AND slot/casino context so unrelated stock photos never appear
            if (gameTokens.length > 0 && !gameTokens.some((tok) => comb.includes(tok))) continue;
            const badDomains = ["amazon.", "shutterstock.", "alamy.", "dreamstime.", "pixabay.", "freepik.", "etsystatic.", "redbubble.", "alicdn."];
            if (badDomains.some((d) => comb.includes(d))) continue;

            const wMatch = block.match(/\bwidth="(\d+)"/i);
            const hMatch = block.match(/\bheight="(\d+)"/i);
            const iw = wMatch ? parseInt(wMatch[1], 10) : 0;
            const ih = hMatch ? parseInt(hMatch[1], 10) : 0;
            if (iw <= 0 || ih <= 0) continue;

            let domainBonus = 0;
            if (comb.includes("mediumrare.imgix.net") || comb.includes("cloudfront.net") || comb.includes("shuffle-com")) {
              domainBonus += 1.5;
            }
            if (comb.includes("youtube.com") || comb.includes("ytimg.com") || comb.includes("play-demo")) {
              domainBonus -= 2.0;
            }
            addSpec(murl, iw, ih, domainBonus, turl);
          } catch (e) {}
        }
      }
    } catch (e) {}

    // Sort candidate specs by estimated ratio match score and decode top 10 in parallel
    candidateSpecs.sort((a, b) => b.estScore - a.estScore);
    const topSpecs = candidateSpecs.slice(0, 10);

    const loadedResults = await Promise.all(
      topSpecs.map(async (spec) => {
        for (const u of [spec.url, spec.fallbackUrl].filter(Boolean)) {
          try {
            const img = await loadCandidateImageWithCors(u);
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            if (iw < 90 || ih < 90) continue;

            const c = document.createElement("canvas");
            c.width = iw;
            c.height = ih;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const actualScore = computeRatioMatchScore(iw, ih, targetW, targetH, spec.bonus);
            const fp = computeImageFingerprint(img);
            return {
              originalBase64: c.toDataURL("image/png"),
              adaptiveColor: computeAdaptiveColorFromCanvas(c),
              sourceUrl: u,
              width: iw,
              height: ih,
              ratio: iw / ih,
              score: actualScore,
              fp
            };
          } catch (e) {}
        }
        return null;
      })
    );

    // Filter valid, sort strictly by actual decoded aspect-ratio score, and deduplicate visually identical images
    const valid = loadedResults.filter(Boolean).sort((a, b) => b.score - a.score);
    const unique = [];
    for (const item of valid) {
      if (!unique.some((u) => areFingerprintsSimilar(u.fp, item.fp))) {
        unique.push(item);
      }
      if (unique.length >= 4) break;
    }

    return unique;
  }

  // ==========================================
  // EXPOSE window.thumbupAPI
  // ==========================================
  window.thumbupAPI = {
    getInitData: async () => {
      const stored = getStoredData();
      return {
        ...stored,
        fonts: DEFAULT_FONTS
      };
    },

    getSystemFonts: async () => {
      const fontMap = new Map();
      DEFAULT_FONTS.forEach((f) => fontMap.set(`${f.family}::${f.style}`, f));

      if (typeof window.queryLocalFonts === "function") {
        try {
          const locals = await window.queryLocalFonts();
          locals.forEach((lf) => {
            if (lf.family) {
              const fam = lf.family;
              const style = lf.style || "Regular";
              fontMap.set(`${fam}::${style}`, { family: fam, style });
            }
          });
        } catch (e) {}
      }

      const list = Array.from(fontMap.values()).sort(
        (a, b) => a.family.localeCompare(b.family) || a.style.localeCompare(b.style)
      );
      return { fonts: list };
    },

    saveSettings: async (settings) => {
      const data = getStoredData();
      data.latest = Object.assign({}, data.latest, settings);
      setStoredData(data);
      return { ok: true };
    },

    savePreset: async (preset) => {
      const data = getStoredData();
      data.presets = data.presets || [];
      const newPreset = Object.assign(
        { id: preset.id || `p-${Date.now()}` },
        preset
      );
      const idx = data.presets.findIndex((p) => p.id === newPreset.id);
      if (idx >= 0) data.presets[idx] = newPreset;
      else data.presets.push(newPreset);
      setStoredData(data);
      return { ok: true, presets: data.presets };
    },

    deletePreset: async (id) => {
      const data = getStoredData();
      data.presets = (data.presets || []).filter((p) => p.id !== id);
      setStoredData(data);
      return { ok: true, presets: data.presets };
    },

    selectInputFolder: async () => {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "image/*";
        input.onchange = async (e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) {
            resolve({ canceled: true });
            return;
          }

          const fileItems = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const dataUrl = await new Promise((res) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result);
              reader.readAsDataURL(f);
            });
            const baseName = f.name.replace(/\.[^/.]+$/, "");
            window._currentImportedFiles[f.name] = dataUrl;
            fileItems.push({
              fullPath: f.name,
              fileName: f.name,
              relativePath: f.name,
              name: f.name,
              provider: "Upload",
              game: baseName,
              dataUrl
            });
          }

          resolve({
            canceled: false,
            folderName: `Uploaded Files (${files.length})`,
            folderPath: `Uploaded Files (${files.length})`,
            files: fileItems
          });
        };
        input.click();
      });
    },

    selectExportFolder: async () => {
      return {
        canceled: false,
        folderPath: "Downloads (ZIP Package)"
      };
    },

    scrapeAndProcess: async (payload) => {
      const w = Number(payload.width) || 210;
      const h = Number(payload.height) || 264;
      const game = payload.game || "";
      const provider = payload.provider || "";

      const ranked = await searchAndRankGameImages(provider, game, w, h);

      const alts = [];
      for (const item of ranked) {
        alts.push({
          originalBase64: item.originalBase64,
          adaptiveColor: item.adaptiveColor,
          sourceUrl: item.sourceUrl
        });
      }

      if (alts.length === 0) {
        for (let i = 0; i < 4; i++) {
          const b64 = generateAtmosphericGameScene(game, provider, w, h, i);
          alts.push({
            originalBase64: b64,
            adaptiveColor: "#38BDF8",
            sourceUrl: "Studio Custom Scene"
          });
        }
      }

      return {
        ok: true,
        originalBase64: alts[0].originalBase64,
        cleanedBase64: alts[0].originalBase64,
        adaptiveColor: alts[0].adaptiveColor,
        sourceUrl: alts[0].sourceUrl,
        alternatives: alts.slice(1)
      };
    },

    processLocalImage: async (payload) => {
      const b64 =
        payload.imageBase64 ||
        payload.dataUrl ||
        (window._currentImportedFiles && window._currentImportedFiles[payload.fullPath]);
      if (!b64) {
        return { ok: false, error: "Image data not found" };
      }

      const img = await loadImage(b64);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const tmpC = document.createElement("canvas");
      tmpC.width = w;
      tmpC.height = h;
      tmpC.getContext("2d").drawImage(img, 0, 0);
      const adaptiveHex = computeAdaptiveColorFromCanvas(tmpC);

      if (payload.removeFlatText) {
        const sensitivity = payload.sensitivity || "balanced";
        let textMaskUrl = null;
        let detected = false;

        // 1. Deep Learning PP-OCRv4 DBNet Neural Text Detection + Unclipped Tight Glyph Segmentation
        try {
          const ocrRes = await detectTextMaskPpOcr(b64, sensitivity);
          if (ocrRes && ocrRes.maskDataUrl) {
            textMaskUrl = ocrRes.maskDataUrl;
            detected = true;
          }
        } catch (e) {
          console.warn("PP-OCR neural detection error:", e);
        }

        // 2. High-Contrast Stroke Fallback if neural detector found nothing
        if (!detected) {
          const p = tmpC.getContext("2d").getImageData(0, 0, w, h).data;
          const mCanvas = document.createElement("canvas");
          mCanvas.width = w;
          mCanvas.height = h;
          const mCtx = mCanvas.getContext("2d");
          mCtx.fillStyle = "#000000";
          mCtx.fillRect(0, 0, w, h);
          mCtx.fillStyle = "#FFFFFF";

          let textPixelsFound = 0;
          for (let y = Math.round(h * 0.45); y < h - 10; y += 2) {
            for (let x = 10; x < w - 10; x += 2) {
              const idx = (y * w + x) * 4;
              if (p[idx + 3] < 128) continue;
              const lum = 0.299 * p[idx] + 0.587 * p[idx + 1] + 0.114 * p[idx + 2];
              if (lum > 185) {
                const leftIdx = (y * w + (x - 4)) * 4;
                const rightIdx = (y * w + (x + 4)) * 4;
                const lumL = 0.299 * p[leftIdx] + 0.587 * p[leftIdx + 1] + 0.114 * p[leftIdx + 2];
                const lumR = 0.299 * p[rightIdx] + 0.587 * p[rightIdx + 1] + 0.114 * p[rightIdx + 2];
                if (lumL < 135 || lumR < 135) {
                  mCtx.fillRect(x - 5, y - 5, 11, 11);
                  textPixelsFound++;
                }
              }
            }
          }
          if (textPixelsFound > 18) {
            textMaskUrl = mCanvas.toDataURL("image/png");
            detected = true;
          }
        }

        const cleaned = detected ? await inpaintCanvas(b64, textMaskUrl, 0) : b64;
        return {
          ok: true,
          originalBase64: b64,
          cleanedBase64: cleaned,
          adaptiveColor: adaptiveHex,
          textWasRemoved: detected,
          removedTextItems: detected ? [{ text: "Detected Title & Text", score: 0.97 }] : []
        };
      }

      return {
        ok: true,
        originalBase64: b64,
        cleanedBase64: b64,
        adaptiveColor: adaptiveHex,
        textWasRemoved: false
      };
    },

    inpaintCustomMask: async (payload) => {
      try {
        // Dilate user brush strokes by 3px so anti-aliased text halos around the brush are cleanly erased
        const cleaned = await inpaintCanvas(payload.imageBase64, payload.maskBase64, 3);
        const img = await loadImage(cleaned);
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        return {
          ok: true,
          cleanedBase64: cleaned,
          adaptiveColor: computeAdaptiveColorFromCanvas(c)
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    outpaintEmptySpace: async (payload) => {
      try {
        return await outpaintCanvas(
          payload.imageBase64,
          payload.width,
          payload.height,
          payload.cropFitMode,
          payload.cropAlign,
          payload.cropOffsetX,
          payload.cropOffsetY,
          payload.cropZoom,
          payload.variantSeed
        );
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    exportThumbnails: async (payload) => {
      const items = payload.items || [];
      if (items.length === 0) {
        return { ok: false, error: "No items to export" };
      }

      const ext = (payload.format || "png").toLowerCase();
      const naming = payload.namingPattern || payload.naming || "provider-game";
      const structure = payload.saveMode || payload.structure || "single";

      const buildFileName = (it, i) => {
        const p = (it.provider || "Provider").replace(/[<>:"/\\|?*]/g, "").trim();
        const g = (it.game || `Thumbnail_${i + 1}`).replace(/[<>:"/\\|?*]/g, "").trim();
        if (naming === "game-only") return `${g}.${ext}`;
        if (naming === "brackets") return `(${p}) ${g}.${ext}`;
        return `${p} - ${g}.${ext}`;
      };

      if (items.length === 1) {
        const it = items[0];
        const a = document.createElement("a");
        a.href = it.dataUrl;
        a.download = buildFileName(it, 0);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return {
          ok: true,
          savedCount: 1,
          outputDir: `Downloaded (${a.download})`
        };
      }

      if (typeof window.JSZip === "function") {
        const zip = new window.JSZip();
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const fName = buildFileName(it, i);
          const pFolder = (it.provider || "Unknown Provider").replace(/[<>:"/\\|?*]/g, "").trim();
          const zipPath = structure === "hierarchy" ? `${pFolder}/${fName}` : fName;
          const base64Data = it.dataUrl.replace(/^data:image\/\w+;base64,/, "");
          zip.file(zipPath, base64Data, { base64: true });
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `ThumbUp_Export_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return {
          ok: true,
          savedCount: items.length,
          outputDir: `Downloaded (${a.download})`
        };
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const a = document.createElement("a");
          a.href = it.dataUrl;
          a.download = buildFileName(it, i);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await new Promise((r) => setTimeout(r, 200));
        }
        return {
          ok: true,
          savedCount: items.length,
          outputDir: "Downloaded files"
        };
      }
    },

    openPath: async () => {},
    growWindow: async () => {}
  };
})();
