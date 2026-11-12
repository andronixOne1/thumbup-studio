const $ = (id) => document.getElementById(id);

const STEP_NAMES = [
  "",
  "Target Size",
  "Source & Scrape",
  "Crop & Corners",
  "Typography",
  "Gradients & Style",
  "Review (4-Grid)",
  "Save & Export",
];

const gr8Providers = [
  "pragmatic play", "evolution", "playtech", "nolimit city", "spadegaming", "zillion games",
  "jdb gaming", "triple profits games", "kajot games", "winfinity", "merkur gaming",
  "stakelogic", "spribe", "pg soft", "pocket games soft", "5mengames", "mplay", "ka gaming",
  "superlotto", "rival gaming", "expanse studios", "100hp gaming", "peter & sons",
  "darpha studios", "origami", "155.io", "rtg slots", "tapking", "hacksaw gaming",
  "push gaming", "relax gaming", "red tiger", "netent", "yggdrasil", "play'n go",
  "quickspin", "bgaming", "booming games", "evoplay", "spinomenal", "wazdan", "betsoft",
  "gameart", "habanero", "isoftbet", "amatic", "endorphina", "blueprint gaming",
  "tom horn gaming", "platipus", "thunderkick", "elks studios", "iron dog studio", "boongo",
  "pragmatic"
];

let currentStep = 1;
let textMode = "names"; // "names" | "folder"
let saveMode = "single"; // "single" | "hierarchy"
let galleryViewMode = "final"; // "final" | "cleaned" | "original"
let presets = [];
let localFolderFiles = [];
let batchItems = []; // Each item can hold `.overrides = {}` for per-thumbnail edits in Step 6!
let selectedPreviewItemIndex = 0;
let activeModalItemIndex = -1;
let tempModalOverrides = {};
let textRemovalMode = "auto"; // "auto" | "manual" (Step 2)
let applyToAll = true; // Steps 3–5: apply edits to every thumbnail vs only the selected one
let baseSettings = null; // Global (all-thumbnail) values for Step 3–5 keys
let lastDomSnapshot = null;
let suppressCapture = false;
let reviewEraser = null;
let step2Eraser = null;
let brushModalItemIdx = -1;

const STEP3_KEYS = ["cropFitMode", "cropAlign", "cropOffsetX", "cropOffsetY", "cropZoom", "enableCornerRounding", "cornerRadius"];
const STEP4_KEYS = [
  "gameFontFamily", "gameFontStyle", "providerFontFamily", "providerFontStyle", "gameSizingMode",
  "gameFontSize", "providerFontSize", "textPlacement", "providerPosition", "gameAllCaps",
  "providerAllCaps", "marginX", "marginY", "spacing", "maxTextHeight",
];
const STEP5_KEYS = [
  "overlayStyle", "gradientType", "radialColorSteps", "radialRadius", "radialColor2", "radialOpacity2",
  "radialAlign", "radialCenterX", "radialCenterY", "standardOpacity", "customColor", "multiColors",
  "customOpacity", "blurRadius", "enableInnerStroke", "innerStrokeWidth", "innerStrokeType",
  "innerStrokeColor1", "innerStrokeOpacity1", "innerStrokeColor2", "innerStrokeOpacity2", "innerStrokeAngle",
];
const STEP_EDIT_KEYS = [...STEP3_KEYS, ...STEP4_KEYS, ...STEP5_KEYS];

// ---------- HELPERS ----------
function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function setStatus(text, isBusy = false) {
  $("statusText").textContent = text;
  $("statusDot").className = "status-dot " + (isBusy ? "busy" : "ready");
}

function setGlobalProgress({ show = true, label = "Processing…", current = 0, total = 0, percent = null }) {
  const banner = $("globalProgressBanner");
  if (!banner) return;
  if (!show) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  const pct = percent !== null ? clamp(Math.round(percent), 0, 100) : (total > 0 ? clamp(Math.round((current / total) * 100), 0, 100) : 0);
  $("globalProgressLabel").textContent = label;
  $("globalProgressCount").textContent = total > 0 ? `${current} / ${total}` : "Working…";
  $("globalProgressPercent").textContent = `${pct}%`;
  $("globalProgressFill").style.width = `${pct}%`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// Cheap signature of a base64 image so cached AI fills are invalidated whenever the base image changes
function srcSignature(src) {
  const s = String(src || "");
  return `${s.length}:${s.slice(-64)}`;
}

function pickKeys(obj, keys) {
  const o = {};
  keys.forEach((k) => {
    if (obj && obj[k] !== undefined) o[k] = obj[k];
  });
  return o;
}

// Global (all-thumbnail) settings: DOM values with Step 3–5 keys taken from the global base
function getBaseSettings() {
  const dom = getSettings();
  if (!baseSettings) {
    baseSettings = pickKeys(dom, STEP_EDIT_KEYS);
  }
  // When applyToAll is true, current DOM is the live global source of truth
  if (applyToAll) {
    Object.assign(baseSettings, pickKeys(dom, STEP_EDIT_KEYS));
  }
  return Object.assign({}, dom, baseSettings);
}

function getItemEffectiveSettings(item, extra = null) {
  const base = getBaseSettings();
  const overrides = applyToAll ? {} : ((item && item.overrides) || {});
  return Object.assign({}, base, overrides, extra || {});
}

function getCropKey(s) {
  const w = clamp(toNumber(s.width, 210), 50, 4000);
  const h = clamp(toNumber(s.height, 264), 50, 4000);
  const fitMode = s.cropFitMode || "fit-both";
  const align = s.cropAlign || "center";
  const sx = clamp(toNumber(s.cropOffsetX, 0), -100, 100);
  const sy = clamp(toNumber(s.cropOffsetY, 0), -100, 100);
  const z = clamp(toNumber(s.cropZoom, 100), 50, 250);
  return { w, h, fitMode, align, sx, sy, z, key: `${w}x${h}:${fitMode}:${align}:${sx}:${sy}:${z}` };
}

// Runs AI outpaint for one item with given effective settings and stores it with a source signature
async function generateOutpaintForItem(item, s, seed) {
  const baseSrc = item.cleanedBase64 || item.originalBase64;
  if (!baseSrc) return false;
  const c = getCropKey(s);
  const res = await window.thumbupAPI.outpaintEmptySpace({
    imageBase64: baseSrc,
    width: c.w,
    height: c.h,
    cropFitMode: c.fitMode,
    cropAlign: c.align,
    cropOffsetX: c.sx,
    cropOffsetY: c.sy,
    cropZoom: c.z,
    variantSeed: seed,
  });
  if (res && res.ok && res.outpaintedBase64) {
    item.outpaintedBase64 = res.outpaintedBase64;
    item.outpaintCropKey = c.key;
    item.outpaintSrcSig = srcSignature(baseSrc);
    item.adaptiveColor = res.adaptiveColor || item.adaptiveColor;
    return true;
  }
  return false;
}

// Records Step 3–5 control changes either globally (Apply to All) or on the selected thumbnail only
function captureStepEdits() {
  if (suppressCapture) return;
  const dom = getSettings();
  if (!baseSettings) baseSettings = pickKeys(dom, STEP_EDIT_KEYS);
  if (!lastDomSnapshot) {
    lastDomSnapshot = dom;
    return;
  }
  const changed = STEP_EDIT_KEYS.filter((k) => String(dom[k]) !== String(lastDomSnapshot[k]));
  lastDomSnapshot = dom;
  if (changed.length === 0) return;

  const item = batchItems[selectedPreviewItemIndex];
  const perItem = !applyToAll && item && currentStep >= 3 && currentStep <= 5;
  if (perItem) {
    item.overrides = item.overrides || {};
    changed.forEach((k) => {
      item.overrides[k] = dom[k];
    });
  } else {
    changed.forEach((k) => {
      baseSettings[k] = dom[k];
      batchItems.forEach((it) => {
        if (it.overrides) delete it.overrides[k];
      });
    });
  }
}

// Loads the selected thumbnail's effective values (global + its own overrides) into Step 3–5 controls
function loadItemIntoControls() {
  const dom = getSettings();
  if (!baseSettings) baseSettings = pickKeys(dom, STEP_EDIT_KEYS);
  const item = batchItems[selectedPreviewItemIndex];

  if (!applyToAll) {
    // When editing per-item, load this specific item's overrides into the controls
    const eff = Object.assign({}, baseSettings, (item && item.overrides) || {});
    suppressCapture = true;
    try {
      applySettings(eff, true);
    } finally {
      suppressCapture = false;
    }
  } else {
    // When Apply to All is active, current DOM controls are the global truth: sync them to baseSettings
    Object.assign(baseSettings, pickKeys(dom, STEP_EDIT_KEYS));
  }
  lastDomSnapshot = getSettings();
  if (typeof window.__ensureSelectedFontsLoaded === "function") {
    window.__ensureSelectedFontsLoaded().then(() => refreshActiveStagePreview());
  }
}

// ---------- WINDOW AUTO-FIT (grow window instead of showing a scrollbar on config pages) ----------
let autoFitTimer = null;
function scheduleAutoFit() {
  clearTimeout(autoFitTimer);
  autoFitTimer = setTimeout(autoFitWindow, 60);
}

async function autoFitWindow() {
  if (![1, 3, 4, 5, 7].includes(currentStep)) return;
  const view = $(`stepView${currentStep}`);
  const card = view && view.querySelector(".stage-config-card");
  if (!card || !window.thumbupAPI.growWindow) return;
  const overflow = card.scrollHeight - card.clientHeight;
  if (overflow > 2) {
    await window.thumbupAPI.growWindow(Math.ceil(overflow) + 16);
  }
}

function hexToRgb(hex) {
  const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return res
    ? { r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) }
    : { r: 45, g: 156, b: 219 };
}

function parseEntry(raw) {
  if (typeof raw === "object" && raw !== null) {
    return {
      provider: raw.provider || "",
      game: raw.game || "Placeholder",
      raw: raw.provider ? `${raw.provider} - ${raw.game}` : raw.game,
    };
  }
  const value = String(raw || "Placeholder").trim();
  const bracketMatch = value.match(/\(([^)]+)\)/);
  if (bracketMatch) {
    const provider = bracketMatch[1].trim();
    const game = value.replace(bracketMatch[0], "").replace(/\s+/g, " ").trim();
    return { provider, game, raw: value };
  }
  const parts = value.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return {
      provider: parts[0].trim(),
      game: parts.slice(1).join(" - ").trim(),
      raw: value,
    };
  }
  for (const p of gr8Providers) {
    if (value.toLowerCase().includes(p.toLowerCase())) {
      const reg = new RegExp(p, "ig");
      const game = value.replace(reg, "").replace(/[-_()]/g, " ").replace(/\s+/g, " ").trim();
      if (game) return { provider: p, game, raw: value };
    }
  }
  return { provider: "", game: value, raw: value };
}

function parseFolderFileEntry(fileObj) {
  const rel = (fileObj.relativePath || fileObj.fileName || "").replace(/\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  let provider = "";
  let game = (fileObj.fileName || rel).replace(/\.[^/.]+$/, "");

  if (parts.length >= 2) {
    provider = parts[parts.length - 2];
    game = game.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  } else {
    const parsed = parseEntry(game);
    provider = parsed.provider;
    game = parsed.game.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  }
  return {
    fullPath: fileObj.fullPath,
    relativePath: rel,
    fileName: fileObj.fileName,
    provider: provider || "Unknown Provider",
    game: game || "Unknown Game",
  };
}

function getLineOptions(gameName) {
  const words = String(gameName || "Placeholder").trim().split(/\s+/).filter(Boolean);
  const options = [];
  if (words.length <= 1) {
    options.push(words.join(" ") || "Placeholder");
    return options;
  }
  options.push(words.join(" "));
  const score = (arr) => Math.max(...arr.map((x) => x.length)) - Math.min(...arr.map((x) => x.length));

  if (words.length >= 2) {
    let best2 = null, b2 = 1e9;
    for (let i = 1; i < words.length; i++) {
      const p = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const sc = score(p);
      if (sc < b2) { b2 = sc; best2 = p; }
    }
    if (best2) options.push(best2.join("\n"));
  }

  if (words.length >= 3) {
    let best3 = null, b3 = 1e9;
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const p = [words.slice(0, i).join(" "), words.slice(i, j).join(" "), words.slice(j).join(" ")];
        const sc = score(p);
        if (sc < b3) { b3 = sc; best3 = p; }
      }
    }
    if (best3) options.push(best3.join("\n"));
  }
  return options;
}

function styleToWeight(style) {
  const s = String(style || "Regular").toLowerCase();
  const isItalic = s.includes("italic");
  let weight = "400";
  if (s.includes("black") || s.includes("heavy")) weight = "900";
  else if (s.includes("extrabold") || s.includes("ultrabold")) weight = "800";
  else if (s.includes("semibold") || s.includes("demibold")) weight = "600";
  else if (s.includes("bold")) weight = "700";
  else if (s.includes("medium")) weight = "500";
  else if (s.includes("light")) weight = "300";
  return isItalic ? `italic ${weight}` : weight;
}

const loadedCustomFontFaces = new Set();
async function ensureSystemFontLoaded(family, style, filePath) {
  if (!filePath) return;
  const key = `${family}|||${style}`;
  if (loadedCustomFontFaces.has(key)) return;
  loadedCustomFontFaces.add(key);
  try {
    const normPath = String(filePath).replace(/\\/g, "/");
    const sLow = String(style || "Regular").toLowerCase();
    let weight = "400";
    if (sLow.includes("black") || sLow.includes("heavy")) weight = "900";
    else if (sLow.includes("extrabold")) weight = "800";
    else if (sLow.includes("semibold")) weight = "600";
    else if (sLow.includes("bold")) weight = "700";
    else if (sLow.includes("medium")) weight = "500";
    else if (sLow.includes("light")) weight = "300";
    const fontStyle = sLow.includes("italic") ? "italic" : "normal";
    const face = new FontFace(family, `url("file:///${encodeURI(normPath)}")`, {
      weight,
      style: fontStyle,
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
  } catch (e) {}
}

function loadImageElement(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function measureMultilineText(ctx, lines, fontFamily, fontWeight, fontSize, lineHeightRatio = 1.08) {
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", Inter, sans-serif`;
  let maxW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxW) maxW = m.width;
  }
  const lineH = fontSize * lineHeightRatio;
  return { width: maxW, height: lines.length * lineH, lineH };
}

function fitTextBinarySearch(ctx, textValue, fontFamily, fontWeight, maxWidth, maxHeight, maxFontSize, minFontSize) {
  const lines = String(textValue || " ").split("\n");
  let low = Math.max(4, Math.floor(minFontSize));
  let high = Math.max(low, Math.floor(maxFontSize));
  let best = low;
  let fits = false;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const m = measureMultilineText(ctx, lines, fontFamily, fontWeight, mid);
    if (m.width <= maxWidth && m.height <= maxHeight) {
      best = mid;
      fits = true;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const finalMeasure = measureMultilineText(ctx, lines, fontFamily, fontWeight, best);
  return {
    lines,
    fontSize: best,
    width: finalMeasure.width,
    height: finalMeasure.height,
    lineH: finalMeasure.lineH,
    fits,
  };
}

function createRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Core Canvas Renderer supporting:
 * - Step 1 Dimensions (width, height)
 * - Step 3 Cropping (cover / fit-horizontal / fit-vertical + 9-point alignment + X/Y shift + zoom + rounded corners)
 * - Step 4 Typography (Auto-Fit 1-3 lines / Fixed, Caps, Stack, Margins)
 * - Step 5 Gradients (Linear OR Radial with 1 or 2 color steps, Dark+Color, Adaptive, Progressive Blur, Multi-Color)
 * - Step 6 Per-Thumbnail Overrides (`item.overrides`)
 */
async function renderThumbnailToCanvas(canvas, item, baseSettings, customOverrides = null) {
  const itemOverrides = applyToAll ? {} : ((item && item.overrides) || {});
  const s = Object.assign({}, baseSettings, itemOverrides, customOverrides || {});
  const w = clamp(toNumber(s.width, 210), 50, 4000);
  const h = clamp(toNumber(s.height, 264), 50, 4000);

  // Assign render token so that overlapping async renders cannot clobber the target canvas
  const renderId = (canvas.__lastRenderId = (canvas.__lastRenderId || 0) + 1);

  // Double-buffering: draw on isolated offscreen canvas to prevent concurrent race conditions
  const offCanvas = document.createElement("canvas");
  offCanvas.width = w;
  offCanvas.height = h;
  const ctx = offCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  ctx.save();

  // Apply Rounded Corners Clipping if enabled in Step 3
  const roundEnabled = Boolean(s.enableCornerRounding);
  const cornerRadius = roundEnabled ? clamp(toNumber(s.cornerRadius, 20), 0, Math.min(w, h) / 2) : 0;
  if (roundEnabled && cornerRadius > 0) {
    createRoundedRectPath(ctx, 0, 0, w, h, cornerRadius);
    ctx.clip();
  }

  const placement = s.textPlacement === "up" ? "up" : "down";
  const providerPosition = s.providerPosition === "over" ? "over" : "under";

  // 1. Draw Background Image with Step 3 Fit Mode, 9-Point Alignment, Shift, Zoom & Optional AI Outpaint Fill
  const fitMode = s.cropFitMode || "fit-both"; // "fit-both" | "cover" | "fit-horizontal" | "fit-vertical"
  const align = s.cropAlign || "center";
  const shiftXVal = clamp(toNumber(s.cropOffsetX, 0), -100, 100);
  const shiftYVal = clamp(toNumber(s.cropOffsetY, 0), -100, 100);
  const zoomVal = clamp(toNumber(s.cropZoom, 100), 50, 250);
  const currentCropKey = `${w}x${h}:${fitMode}:${align}:${shiftXVal}:${shiftYVal}:${zoomVal}`;

  const baseSrcForSig = item ? item.cleanedBase64 || item.originalBase64 || "" : "";
  const hasValidOutpaint = Boolean(
    item &&
      item.outpaintedBase64 &&
      item.outpaintCropKey === currentCropKey &&
      item.outpaintSrcSig === srcSignature(baseSrcForSig)
  );
  const bgSrc = hasValidOutpaint
    ? item.outpaintedBase64
    : item
    ? item.cleanedBase64 || item.originalBase64
    : null;
  const bgImg = await loadImageElement(bgSrc);

  if (bgImg) {
    if (hasValidOutpaint) {
      // Outpainted image already fills the entire W x H frame seamlessly
      ctx.drawImage(bgImg, 0, 0, w, h);
    } else {
      // Fill dark backdrop first (visible if scaling/shifting leaves empty space)
      ctx.fillStyle = "#101014";
      ctx.fillRect(0, 0, w, h);

      const shiftXPercent = shiftXVal / 100;
      const shiftYPercent = shiftYVal / 100;
      const zoomFactor = zoomVal / 100;

      let drawW = w;
      let drawH = h;

      if (fitMode === "fit-both") {
        // Fits 100% horizontally and 100% vertically inside the W x H frame (no cropping)
        drawW = w * zoomFactor;
        drawH = h * zoomFactor;
      } else {
        let baseScale = 1;
        if (fitMode === "fit-horizontal") {
          baseScale = w / bgImg.width;
        } else if (fitMode === "fit-vertical") {
          baseScale = h / bgImg.height;
        } else {
          // cover
          baseScale = Math.max(w / bgImg.width, h / bgImg.height);
        }
        const finalScale = baseScale * zoomFactor;
        drawW = bgImg.width * finalScale;
        drawH = bgImg.height * finalScale;
      }

      // Anchor factors (0 = left/top, 0.5 = center, 1 = right/bottom)
      let ax = 0.5;
      let ay = 0.5;
      if (align.includes("left")) ax = 0.0;
      if (align.includes("right")) ax = 1.0;
      if (align.includes("top")) ay = 0.0;
      if (align.includes("bottom")) ay = 1.0;

      let dx = (w - drawW) * ax + shiftXPercent * (w * 0.5);
      let dy = (h - drawH) * ay + shiftYPercent * (h * 0.5);

      ctx.drawImage(bgImg, dx, dy, drawW, drawH);
    }
  } else {
    // Checkerboard placeholder
    ctx.fillStyle = "#222228";
    ctx.fillRect(0, 0, w, h);
    const tile = Math.max(10, Math.round(Math.min(w, h) / 14));
    ctx.fillStyle = "#2C2C34";
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        if (((x / tile) + (y / tile)) % 2 === 0) {
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }
  }

  // 2. Draw Step 5 Gradient / Overlay (Supports Linear AND Radial with 1 or 2 Color Steps!)
  const overlayStyle = s.overlayStyle || "dark-color";
  const gradType = s.gradientType || "linear"; // "linear" | "radial"
  const radialSteps = String(s.radialColorSteps || "1");
  const radialRadiusPct = clamp(toNumber(s.radialRadius, 75), 20, 200) / 100;

  const stdOp = clamp(toNumber(s.standardOpacity, 40), 0, 100) / 100;
  const custOp = clamp(toNumber(s.customOpacity, 83), 0, 100) / 100;
  const radOp2 = clamp(toNumber(s.radialOpacity2, 65), 0, 100) / 100;

  function getRadialCenterCoords() {
    const rAlign = s.radialAlign || "";
    let cxPct = toNumber(s.radialCenterX, NaN);
    let cyPct = toNumber(s.radialCenterY, NaN);
    if (!Number.isFinite(cxPct) || !Number.isFinite(cyPct) || (customOverrides && customOverrides.radialAlign)) {
      const map = {
        "top-left": [15, 15],
        "top": [50, 15],
        "top-right": [85, 15],
        "left": [15, 50],
        "center": [50, 50],
        "right": [85, 50],
        "bottom-left": [15, 85],
        "bottom": [50, 85],
        "bottom-right": [85, 85],
      };
      if (map[rAlign]) {
        cxPct = map[rAlign][0];
        cyPct = map[rAlign][1];
      } else {
        cxPct = Number.isFinite(cxPct) ? cxPct : 50;
        cyPct = Number.isFinite(cyPct) ? cyPct : (placement === "up" ? 15 : 85);
      }
    }
    return {
      cx: (clamp(cxPct, 0, 100) / 100) * w,
      cy: (clamp(cyPct, 0, 100) / 100) * h,
    };
  }

  function drawLinearOverlay(rgb, alpha) {
    const gradY0 = h / 2;
    const gradY1 = placement === "up" ? 0 : h;
    const grad = ctx.createLinearGradient(0, gradY0, 0, gradY1);
    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, placement === "up" ? 0 : h / 2, w, h / 2);
  }

  function drawRadialOverlay(rgb1, alpha1, rgb2 = null, alpha2 = 0) {
    const { cx, cy } = getRadialCenterCoords();
    const maxR = Math.max(w, h) * radialRadiusPct;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(0, `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, ${alpha1})`);
    if (rgb2 && radialSteps === "2") {
      grad.addColorStop(0.62, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${alpha2})`);
      grad.addColorStop(1, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${(alpha2 * 0.15).toFixed(3)})`);
    } else {
      grad.addColorStop(1, `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0)`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  if (overlayStyle === "progressive-blur") {
    const maxBlur = clamp(toNumber(s.blurRadius, 12), 1, 50);
    if (bgImg) {
      const steps = 8;
      const halfH = h / 2;

      // Snapshot clean background from offCanvas (NOT the target canvas, which holds previous composite!)
      const bgSnapshot = document.createElement("canvas");
      bgSnapshot.width = w;
      bgSnapshot.height = h;
      bgSnapshot.getContext("2d").drawImage(offCanvas, 0, 0);

      const blurBuffer = document.createElement("canvas");
      blurBuffer.width = w;
      blurBuffer.height = h;
      const blurCtx = blurBuffer.getContext("2d");

      for (let st = 1; st <= steps; st++) {
        const t = st / steps;
        const blurPx = (t * maxBlur) / 2.2;
        blurCtx.clearRect(0, 0, w, h);
        blurCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
        blurCtx.drawImage(bgSnapshot, 0, 0);

        const sliceH = halfH / steps;
        const sliceY = placement === "up" ? halfH - st * sliceH : halfH + (st - 1) * sliceH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, sliceY, w, sliceH + 1);
        ctx.clip();
        ctx.drawImage(blurBuffer, 0, 0);
        ctx.restore();
      }
    }
    drawLinearOverlay({ r: 0, g: 0, b: 0 }, stdOp * 0.45);
  } else if (overlayStyle !== "none") {
    // Draw dark readability base
    if (["dark-only", "dark-color", "multi-color", "adaptive"].includes(overlayStyle)) {
      if (gradType === "radial") {
        drawRadialOverlay({ r: 0, g: 0, b: 0 }, stdOp);
      } else {
        drawLinearOverlay({ r: 0, g: 0, b: 0 }, stdOp);
      }
    }

    // Determine primary & secondary color for color overlay modes
    let primaryHex = s.customColor || "#2D9CDB";
    if (overlayStyle === "multi-color") {
      const palette = String(s.multiColors || "#FF0000, #2D9CDB, #27AE60")
        .split(",")
        .map((c) => c.trim())
        .filter((c) => /^#[0-9A-Fa-f]{6}$/i.test(c));
      primaryHex = (item && item.randColor) || palette[0] || "#2D9CDB";
    } else if (overlayStyle === "adaptive") {
      primaryHex = (item && item.adaptiveColor) || s.customColor || "#2D9CDB";
    }

    if (["dark-color", "multi-color", "adaptive"].includes(overlayStyle)) {
      const rgb1 = hexToRgb(primaryHex);
      const rgb2 = hexToRgb(s.radialColor2 || "#9B51E0");
      if (gradType === "radial") {
        drawRadialOverlay(rgb1, custOp, rgb2, radOp2);
      } else {
        drawLinearOverlay(rgb1, custOp);
      }
    }
  }

  // 3. Draw Step 4 Typography
  const rawProvider = item ? item.provider : "Pragmatic Play";
  const rawGame = item ? item.game : "Gates of Olympus 1000";

  const gameAllCaps = Boolean(s.gameAllCaps);
  const providerAllCaps = Boolean(s.providerAllCaps);

  const gameFontFamily = s.gameFontFamily || "Montserrat";
  const gameFontWeight = styleToWeight(s.gameFontStyle || "Black");
  const providerFontFamily = s.providerFontFamily || "Agency FB";
  const providerFontWeight = styleToWeight(s.providerFontStyle || "Regular");

  const providerFontSize = clamp(toNumber(s.providerFontSize, 16), 6, 400);
  const isManual = s.gameSizingMode === "manual";
  const manualGameFontSize = clamp(toNumber(s.gameFontSize, 32), 6, 400);

  const maxTextHeightPercent = clamp(toNumber(s.maxTextHeight, 40), 10, 90) / 100;
  const marginX = (clamp(toNumber(s.marginX, 4), 0, 48) / 100) * w;
  const marginY = (clamp(toNumber(s.marginY, 6), 0, 48) / 100) * h;
  const gap = toNumber(s.spacing, 7);

  const gameMaxFontSize = isManual ? manualGameFontSize : Math.max(30, Math.floor(h * 0.4));
  const gameMinFontSize = isManual ? manualGameFontSize : 14;
  const gameMaxWidth = Math.max(16, Math.min(w * 0.88, w - marginX * 2));
  const providerMaxWidth = Math.max(16, w - marginX * 2);

  const providerValue = rawProvider
    ? providerAllCaps
      ? rawProvider.toUpperCase()
      : rawProvider
    : "";

  let providerSpec = null;
  if (providerValue) {
    providerSpec = fitTextBinarySearch(
      ctx,
      providerValue,
      providerFontFamily,
      providerFontWeight,
      providerMaxWidth,
      h * 0.2,
      providerFontSize,
      Math.min(8, providerFontSize)
    );
  }

  const providerHeightForCalc = providerSpec ? providerSpec.height : 0;
  const gapForCalc = providerSpec ? gap : 0;
  const maxTotalTextHeight = h * maxTextHeightPercent;
  const maxGameHeight = Math.max(12, maxTotalTextHeight - providerHeightForCalc - gapForCalc);

  const options = getLineOptions(rawGame);
  let bestSpec = null;
  let bestSize = -1;
  let bestLineCount = 100;

  for (let i = 0; i < options.length; i++) {
    const textVal = gameAllCaps ? options[i].toUpperCase() : options[i];
    const res = fitTextBinarySearch(
      ctx,
      textVal,
      gameFontFamily,
      gameFontWeight,
      gameMaxWidth,
      maxGameHeight,
      gameMaxFontSize,
      gameMinFontSize
    );
    if (res.fits) {
      if (res.fontSize > bestSize || (res.fontSize === bestSize && i + 1 < bestLineCount)) {
        bestSpec = res;
        bestSize = res.fontSize;
        bestLineCount = i + 1;
        if (bestSize === gameMaxFontSize) break;
      }
    }
  }

  if (!bestSpec) {
    const fallbackStr = gameAllCaps
      ? options[options.length - 1].toUpperCase()
      : options[options.length - 1];
    bestSpec = fitTextBinarySearch(
      ctx,
      fallbackStr,
      gameFontFamily,
      gameFontWeight,
      gameMaxWidth,
      maxGameHeight,
      gameMinFontSize,
      8
    );
  }

  const totalHeight = bestSpec.height + (providerSpec ? gap + providerHeightForCalc : 0);
  const groupTopY = placement === "up" ? marginY : h - marginY - totalHeight;

  let gameTopY = groupTopY;
  let provTopY = groupTopY;
  if (providerSpec && providerPosition === "over") {
    provTopY = groupTopY;
    gameTopY = provTopY + providerSpec.height + gap;
  } else {
    gameTopY = groupTopY;
    if (providerSpec) provTopY = gameTopY + bestSpec.height + gap;
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `${gameFontWeight} ${bestSpec.fontSize}px "${gameFontFamily}", Inter, sans-serif`;
  for (let i = 0; i < bestSpec.lines.length; i++) {
    ctx.fillText(bestSpec.lines[i], w / 2, gameTopY + i * bestSpec.lineH);
  }

  if (providerSpec) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = `${providerFontWeight} ${providerSpec.fontSize}px "${providerFontFamily}", Inter, sans-serif`;
    for (let i = 0; i < providerSpec.lines.length; i++) {
      ctx.fillText(providerSpec.lines[i], w / 2, provTopY + i * providerSpec.lineH);
    }
  }

  // 4. Draw Step 5 Inner Stroke (Frame Border: Size, Solid Color, or Linear/Radial Gradient)
  if (Boolean(s.enableInnerStroke)) {
    const strokeW = clamp(toNumber(s.innerStrokeWidth, 3), 1, 60);
    const strokeType = s.innerStrokeType || "linear"; // "solid" | "linear" | "radial"
    const sc1 = hexToRgb(s.innerStrokeColor1 || "#FFFFFF");
    const so1 = clamp(toNumber(s.innerStrokeOpacity1, 75), 0, 100) / 100;
    const sc2 = hexToRgb(s.innerStrokeColor2 || "#2D9CDB");
    const so2 = clamp(toNumber(s.innerStrokeOpacity2, 15), 0, 100) / 100;
    const sAngle = s.innerStrokeAngle || "to-bottom";

    const c1Str = `rgba(${sc1.r}, ${sc1.g}, ${sc1.b}, ${so1})`;
    const c2Str = `rgba(${sc2.r}, ${sc2.g}, ${sc2.b}, ${so2})`;

    let strokeStyle = c1Str;
    if (strokeType === "linear") {
      let x0 = 0, y0 = 0, x1 = 0, y1 = h;
      if (sAngle === "to-top") {
        x0 = 0; y0 = h; x1 = 0; y1 = 0;
      } else if (sAngle === "to-right") {
        x0 = 0; y0 = 0; x1 = w; y1 = 0;
      } else if (sAngle === "to-br") {
        x0 = 0; y0 = 0; x1 = w; y1 = h;
      } else if (sAngle === "to-tr") {
        x0 = 0; y0 = h; x1 = w; y1 = 0;
      }
      const sGrad = ctx.createLinearGradient(x0, y0, x1, y1);
      sGrad.addColorStop(0, c1Str);
      sGrad.addColorStop(1, c2Str);
      strokeStyle = sGrad;
    } else if (strokeType === "radial") {
      const rGrad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.1,
        w / 2,
        h / 2,
        Math.hypot(w / 2, h / 2)
      );
      rGrad.addColorStop(0, c1Str);
      rGrad.addColorStop(1, c2Str);
      strokeStyle = rGrad;
    }

    const inset = strokeW / 2;
    ctx.save();
    if (roundEnabled && cornerRadius > 0) {
      createRoundedRectPath(
        ctx,
        inset,
        inset,
        Math.max(1, w - strokeW),
        Math.max(1, h - strokeW),
        Math.max(0, cornerRadius - inset)
      );
    } else {
      ctx.beginPath();
      ctx.rect(inset, inset, Math.max(1, w - strokeW), Math.max(1, h - strokeW));
    }
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // If a newer render was started on this canvas while assets/fonts were loading, discard this stale render
  if (canvas.__lastRenderId && canvas.__lastRenderId !== renderId) {
    return;
  }

  // Atomically blit the completed offscreen image onto the target canvas
  if (canvas !== offCanvas) {
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const targetCtx = canvas.getContext("2d");
    targetCtx.clearRect(0, 0, w, h);
    targetCtx.drawImage(offCanvas, 0, 0);
  }
}

// ---------- GLOBAL SETTINGS COLLECTION ----------
function createMultiColorRow(hexValue) {
  const row = document.createElement("div");
  row.className = "multi-row";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = hexValue;
  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.value = hexValue;
  hexInput.className = "multi-hex";
  hexInput.placeholder = "#HEX";
  hexInput.style.textTransform = "uppercase";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn-danger";
  delBtn.textContent = "✖";
  delBtn.onclick = () => {
    if (document.querySelectorAll(".multi-hex").length > 1) {
      row.remove();
      refreshActiveStagePreview();
    }
  };
  picker.oninput = (e) => {
    hexInput.value = e.target.value;
    refreshActiveStagePreview();
  };
  hexInput.oninput = (e) => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(e.target.value)) {
      picker.value = e.target.value;
      refreshActiveStagePreview();
    }
  };
  row.appendChild(picker);
  row.appendChild(hexInput);
  row.appendChild(delBtn);
  return row;
}

function getMultiColors() {
  return Array.from(document.querySelectorAll(".multi-hex"))
    .map((el) => el.value)
    .join(", ");
}

function setMultiColors(hexString) {
  const container = $("multiColorContainer");
  container.innerHTML = "";
  const colors = String(hexString || "#FF0000, #2D9CDB, #27AE60")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9A-Fa-f]{6}$/i.test(c));
  if (colors.length === 0) colors.push("#2D9CDB");
  colors.forEach((c) => container.appendChild(createMultiColorRow(c)));
}

function getSettings() {
  const [gFam, gStyle] = ($("gameFont").value || "Montserrat|||Black").split("|||");
  const [pFam, pStyle] = ($("providerFont").value || "Agency FB|||Regular").split("|||");
  return {
    textMode,
    width: $("width").value,
    height: $("height").value,
    cropFitMode: $("cropFitMode").value,
    cropAlign: $("cropAlign").value,
    cropOffsetX: $("cropOffsetX").value,
    cropOffsetY: $("cropOffsetY").value,
    cropZoom: $("cropZoom").value,
    enableCornerRounding: $("enableCornerRounding").checked,
    cornerRadius: $("cornerRadius").value,
    textPlacement: $("textPlacement").value,
    overlayStyle: $("overlayStyle").value,
    gradientType: $("gradientType").value,
    radialColorSteps: $("radialColorSteps").value,
    radialRadius: $("radialRadius").value,
    radialColor2: $("radialColor2").value,
    radialOpacity2: $("radialOpacity2").value,
    radialAlign: $("radialAlign").value,
    radialCenterX: $("radialCenterX").value,
    radialCenterY: $("radialCenterY").value,
    standardOpacity: $("standardOpacity").value,
    customColor: $("customColor").value,
    multiColors: getMultiColors(),
    customOpacity: $("customOpacity").value,
    blurRadius: $("blurRadius").value,
    enableInnerStroke: $("enableInnerStroke").checked,
    innerStrokeWidth: $("innerStrokeWidth").value,
    innerStrokeType: $("innerStrokeType").value,
    innerStrokeColor1: $("innerStrokeColor1").value,
    innerStrokeOpacity1: $("innerStrokeOpacity1").value,
    innerStrokeColor2: $("innerStrokeColor2").value,
    innerStrokeOpacity2: $("innerStrokeOpacity2").value,
    innerStrokeAngle: $("innerStrokeAngle").value,
    gameAllCaps: $("gameAllCaps").checked,
    providerAllCaps: $("providerAllCaps").checked,
    gameSizingMode: $("gameSizingMode").value,
    gameFontSize: $("gameFontSize").value,
    providerFontSize: $("providerFontSize").value,
    providerPosition: $("providerPosition").value,
    namesText: $("namesText").value,
    marginX: $("marginX").value,
    marginY: $("marginY").value,
    spacing: $("spacing").value,
    maxTextHeight: $("maxTextHeight").value,
    gameFontFamily: gFam,
    gameFontStyle: gStyle,
    providerFontFamily: pFam,
    providerFontStyle: pStyle,
    removeFlatText: $("removeFlatTextToggle").checked,
    aiSensitivity: $("aiSensitivity").value,
  };
}

function applySettings(s, noRefresh = false) {
  if (!s) return;
  [
    "width", "height", "cropFitMode", "cropAlign", "cropOffsetX", "cropOffsetY", "cropZoom",
    "cornerRadius", "textPlacement", "overlayStyle", "gradientType", "radialColorSteps",
    "radialRadius", "radialOpacity2", "radialAlign", "radialCenterX", "radialCenterY",
    "standardOpacity", "customOpacity", "blurRadius",
    "innerStrokeWidth", "innerStrokeType", "innerStrokeOpacity1", "innerStrokeOpacity2", "innerStrokeAngle",
    "gameSizingMode", "gameFontSize", "providerFontSize", "providerPosition",
    "marginX", "marginY", "spacing", "maxTextHeight"
  ].forEach((k) => {
    if (s[k] !== undefined && $(k)) {
      $(k).value = s[k];
      if ($(k + "Slider")) $(k + "Slider").value = s[k];
    }
  });

  if (s.enableCornerRounding !== undefined) {
    $("enableCornerRounding").checked = Boolean(s.enableCornerRounding);
  }
  if (s.enableInnerStroke !== undefined) {
    $("enableInnerStroke").checked = Boolean(s.enableInnerStroke);
  }
  if (s.customColor) {
    $("customColor").value = s.customColor;
    $("customHex").value = s.customColor;
  }
  if (s.radialColor2) {
    $("radialColor2").value = s.radialColor2;
    $("radialHex2").value = s.radialColor2;
  }
  if (s.innerStrokeColor1) {
    $("innerStrokeColor1").value = s.innerStrokeColor1;
    $("innerStrokeHex1").value = s.innerStrokeColor1;
  }
  if (s.innerStrokeColor2) {
    $("innerStrokeColor2").value = s.innerStrokeColor2;
    $("innerStrokeHex2").value = s.innerStrokeColor2;
  }
  if (s.multiColors) setMultiColors(s.multiColors);
  if (s.gameAllCaps !== undefined) $("gameAllCaps").checked = Boolean(s.gameAllCaps);
  if (s.providerAllCaps !== undefined) $("providerAllCaps").checked = Boolean(s.providerAllCaps);
  if (s.customColor) $("customHex").value = s.customColor;
  const setFontSel = (selId, fam, style) => {
    if (!fam) return;
    const val = `${fam}|||${style || "Regular"}`;
    const sel = $(selId);
    if (sel && [...sel.options].some((o) => o.value === val)) sel.value = val;
  };
  setFontSel("gameFont", s.gameFontFamily, s.gameFontStyle);
  setFontSel("providerFont", s.providerFontFamily, s.providerFontStyle);

  syncStep3UI();
  syncStep5UI();
  $("gameFontSize").disabled = $("gameSizingMode").value !== "manual";
  if (!noRefresh) refreshActiveStagePreview();
}

// ---------- WIZARD STEP NAVIGATION ----------
async function goToStep(targetStep) {
  targetStep = clamp(targetStep, 1, 7);

  // Capture current step edits before leaving current step
  captureStepEdits();

  // If leaving Step 2 forward and batchItems is still empty, auto-trigger fetch/process!
  if (currentStep === 2 && targetStep > 2 && batchItems.length === 0) {
    const ok = await runFetchAndPrepare();
    if (!ok) return;
  }

  currentStep = targetStep;

  // Update Stepper Header Tabs
  document.querySelectorAll("#wizardStepper .step-tab").forEach((tab) => {
    const st = Number(tab.dataset.step);
    tab.classList.toggle("active", st === currentStep);
    tab.classList.toggle("completed", st < currentStep);
  });

  // Update Views
  for (let i = 1; i <= 7; i++) {
    const view = $(`stepView${i}`);
    if (view) view.classList.toggle("active", i === currentStep);
  }

  // Update Footer Dots & Buttons
  document.querySelectorAll("#stepDots .dot").forEach((dot, idx) => {
    dot.classList.toggle("active", idx + 1 === currentStep);
  });

  $("btnPrevStep").disabled = currentStep === 1;
  if (currentStep < 7) {
    $("btnNextStep").classList.remove("hidden");
    $("btnNextStep").textContent = `Next Step: ${STEP_NAMES[currentStep + 1]} →`;
  } else {
    $("btnNextStep").classList.add("hidden");
  }

  setStatus(`Step ${currentStep} of 7 — ${STEP_NAMES[currentStep]}`);
  syncApplyAllCheckboxes();
  populatePreviewSelects();
  if (currentStep >= 3 && currentStep <= 5) {
    loadItemIntoControls();
  }
  await refreshActiveStagePreview();
  scheduleAutoFit();
}

function syncApplyAllCheckboxes() {
  ["applyAllStep3", "applyAllStep4", "applyAllStep5"].forEach((id) => {
    const el = $(id);
    if (el) el.checked = applyToAll;
  });
  document.querySelectorAll(".apply-scope-hint").forEach((el) => {
    el.textContent = applyToAll ? "Edits apply to all thumbnails" : "Edits apply to this thumbnail only";
    el.classList.toggle("single", !applyToAll);
  });
}

function populatePreviewSelects() {
  const selects = [
    $("previewSampleSelectStep3"),
    $("previewSampleSelectStep4"),
    $("previewSampleSelectStep5"),
  ];
  selects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    if (batchItems.length === 0) {
      const opt = document.createElement("option");
      opt.value = "0";
      opt.textContent = "Sample Preview (No Images Loaded Yet)";
      sel.appendChild(opt);
    } else {
      batchItems.forEach((it, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${idx + 1}. ${it.provider ? it.provider + " - " : ""}${it.game}`;
        sel.appendChild(opt);
      });
      sel.value = String(clamp(selectedPreviewItemIndex, 0, batchItems.length - 1));
    }
    sel.onchange = (e) => {
      captureStepEdits();
      selectedPreviewItemIndex = Number(e.target.value) || 0;
      selects.forEach((other) => {
        if (other && other !== sel) other.value = String(selectedPreviewItemIndex);
      });
      loadItemIntoControls();
      refreshActiveStagePreview();
    };
  });
}

let activePreviewPromise = null;
let pendingPreviewUpdate = false;

async function refreshActiveStagePreview() {
  if (activePreviewPromise) {
    pendingPreviewUpdate = true;
    return activePreviewPromise;
  }
  activePreviewPromise = (async () => {
    try {
      do {
        pendingPreviewUpdate = false;
        await doRefreshActiveStagePreview();
      } while (pendingPreviewUpdate);
    } finally {
      activePreviewPromise = null;
    }
  })();
  return activePreviewPromise;
}

async function doRefreshActiveStagePreview() {
  if (!suppressCapture) captureStepEdits();
  const s = getSettings();
  const w = clamp(toNumber(s.width, 210), 50, 4000);
  const h = clamp(toNumber(s.height, 264), 50, 4000);
  const ratio = (w / h).toFixed(2);
  const orient = w / h < 0.88 ? "Tall" : w / h > 1.18 ? "Wide" : "Square";
  $("aspectRatioBadge").textContent = `${w} × ${h} (${ratio}:1 ${orient})`;

  // Step 1 Frame Outline
  const maxBox = 320;
  const scale = Math.min(maxBox / w, maxBox / h);
  const outline = $("step1FrameOutline");
  if (outline) {
    outline.style.width = `${Math.max(60, Math.round(w * scale))}px`;
    outline.style.height = `${Math.max(60, Math.round(h * scale))}px`;
    $("step1FrameDims").textContent = `${w} × ${h} px`;
  }

  const sampleItem =
    batchItems[selectedPreviewItemIndex] ||
    batchItems[0] || {
      provider: "Pragmatic Play",
      game: "Gates of Olympus 1000",
      adaptiveColor: "#2D9CDB",
    };

  if (currentStep === 3) {
    await renderThumbnailToCanvas($("previewCanvasStep3"), sampleItem, s);
  } else if (currentStep === 4) {
    await renderThumbnailToCanvas($("previewCanvasStep4"), sampleItem, s);
  } else if (currentStep === 5) {
    await renderThumbnailToCanvas($("previewCanvasStep5"), sampleItem, s);
  } else if (currentStep === 6) {
    await reRenderAllGalleryCards();
  } else if (currentStep === 7) {
    syncStep7ExportUI();
    await reRenderAllGalleryCards();
  }
}

// ---------- STEP 2: FAST FETCH / SCRAPE & ON-DEMAND AI TEXT REMOVAL BUTTON ----------
async function runFetchAndPrepare() {
  const s = getSettings();
  await window.thumbupAPI.saveSettings(s);

  const w = clamp(toNumber(s.width, 210), 50, 4000);
  const h = clamp(toNumber(s.height, 264), 50, 4000);
  const btn = $("btnFetchAndPrepare");
  const progWrap = $("progressBarWrap");
  const progLabel = $("progressLabel");
  const progCount = $("progressCount");
  const progPct = $("progressPercent");
  const progFill = $("progressFill");
  const progSub = $("progressSubdetail");

  const updateStep2Bar = (current, total, pct, label, sub) => {
    progLabel.textContent = label;
    if (progCount) progCount.textContent = `${current} / ${total}`;
    progPct.textContent = `${pct}%`;
    progFill.style.width = `${pct}%`;
    if (progSub && sub) progSub.textContent = sub;
    setGlobalProgress({ show: true, label, current, total, percent: pct });
    setStatus(label, true);
  };

  if (textMode === "names") {
    const lines = String(s.namesText || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      alert("Please enter at least one game and provider in the list.");
      return false;
    }

    btn.disabled = true;
    progWrap.classList.remove("hidden");
    batchItems = [];
    renderStep2LoadedMiniGrid();

    try {
      for (let i = 0; i < lines.length; i++) {
        const parsed = parseEntry(lines[i]);
        const startPct = Math.round(((i + 0.15) / lines.length) * 100);
        updateStep2Bar(
          i + 1,
          lines.length,
          startPct,
          `Fast Scraping (${i + 1} of ${lines.length}): ${parsed.provider || "Slot"} — ${parsed.game}`,
          `Downloading 3–4 matching ${w}×${h} ratio versions…`
        );
        await nextFrame();

        // Fast scrape: removeFlatText is false until user clicks the AI Text Removal button!
        const res = await window.thumbupAPI.scrapeAndProcess({
          provider: parsed.provider,
          game: parsed.game,
          width: w,
          height: h,
          removeFlatText: false,
          sensitivity: s.aiSensitivity,
        });

        const primaryCand = {
          originalBase64: res && res.ok ? res.originalBase64 : null,
          cleanedBase64: res && res.ok ? res.originalBase64 : null,
          adaptiveColor: (res && res.adaptiveColor) || "#2D9CDB",
          textWasRemoved: false,
          removedTextItems: [],
          sourceUrl: (res && res.sourceUrl) || "",
        };
        const altCands = ((res && res.alternatives) || []).map((a) => ({
          originalBase64: a.originalBase64,
          cleanedBase64: a.originalBase64,
          adaptiveColor: a.adaptiveColor || "#2D9CDB",
          textWasRemoved: false,
          removedTextItems: [],
          sourceUrl: a.sourceUrl || "",
        }));
        const allCandidates = [primaryCand, ...altCands]
          .filter((c) => c.originalBase64)
          .slice(0, 4);

        batchItems.push({
          id: `scrape-${i}-${Date.now()}`,
          provider: parsed.provider,
          game: parsed.game,
          originalBase64: primaryCand.originalBase64,
          cleanedBase64: primaryCand.originalBase64,
          adaptiveColor: primaryCand.adaptiveColor,
          textWasRemoved: false,
          removedTextItems: [],
          alternatives: altCands,
          allCandidates,
          selectedCandidateIdx: 0,
          outpaintedBase64: null,
          outpaintCropKey: null,
          outpaintVariantSeed: 0,
          overrides: {},
        });

        const donePct = Math.round(((i + 1) / lines.length) * 100);
        updateStep2Bar(
          i + 1,
          lines.length,
          donePct,
          `Scraped (${i + 1} of ${lines.length}): ${parsed.game}`,
          `Downloaded ${allCandidates.length} version(s) — switch versions with ◀ / ▶ or click Run AI Text Removal.`
        );
        renderStep2LoadedMiniGrid();
        await nextFrame();
      }
      updateStep2Bar(
        lines.length,
        lines.length,
        100,
        `Fast-scraped ${batchItems.length} games!`,
        `Switch versions with ◀ / ▶ and click "Run AI Text Removal" whenever ready.`
      );
      setStatus(`Scraped ${batchItems.length} games (use ◀ / ▶ to switch versions or click Run AI Text Removal).`);
      populatePreviewSelects();
      return true;
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        progWrap.classList.add("hidden");
        setGlobalProgress({ show: false });
      }, 900);
    }
  } else {
    // Local Folder mode (fast load without AI delay until user clicks the AI Text Removal button)
    if (localFolderFiles.length === 0) {
      alert("Please select a local folder with ready thumbnails first.");
      return false;
    }

    btn.disabled = true;
    progWrap.classList.remove("hidden");
    batchItems = [];
    renderStep2LoadedMiniGrid();

    try {
      for (let i = 0; i < localFolderFiles.length; i++) {
        const f = localFolderFiles[i];
        const startPct = Math.round(((i + 0.15) / localFolderFiles.length) * 100);
        updateStep2Bar(
          i + 1,
          localFolderFiles.length,
          startPct,
          `Loading local image (${i + 1} of ${localFolderFiles.length}): ${f.game}`,
          `Loading "${f.fileName}"…`
        );
        await nextFrame();

        const res = await window.thumbupAPI.processLocalImage({
          fullPath: f.fullPath,
          width: w,
          height: h,
          removeFlatText: false,
          sensitivity: s.aiSensitivity,
        });

        const origB64 = res && res.ok ? res.originalBase64 : null;
        const primaryCand = {
          originalBase64: origB64,
          cleanedBase64: origB64,
          adaptiveColor: (res && res.adaptiveColor) || "#2D9CDB",
          textWasRemoved: false,
          removedTextItems: [],
        };

        batchItems.push({
          id: `folder-${i}-${Date.now()}`,
          provider: f.provider,
          game: f.game,
          originalBase64: origB64,
          cleanedBase64: origB64,
          adaptiveColor: primaryCand.adaptiveColor,
          textWasRemoved: false,
          removedTextItems: [],
          alternatives: [],
          allCandidates: [primaryCand],
          selectedCandidateIdx: 0,
          outpaintedBase64: null,
          outpaintCropKey: null,
          outpaintVariantSeed: 0,
          overrides: {},
        });

        const donePct = Math.round(((i + 1) / localFolderFiles.length) * 100);
        updateStep2Bar(
          i + 1,
          localFolderFiles.length,
          donePct,
          `Loaded (${i + 1} of ${localFolderFiles.length}): ${f.game}`,
          `Ready — click "Run AI Text Removal" if you want to erase text.`
        );
        renderStep2LoadedMiniGrid();
        await nextFrame();
      }
      setStatus(`Loaded ${batchItems.length} folder thumbnails.`);
      populatePreviewSelects();
      return true;
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        progWrap.classList.add("hidden");
        setGlobalProgress({ show: false });
      }, 900);
    }
  }
}

async function runAiTextRemovalOnItems(singleItemIdx = null) {
  if (batchItems.length === 0) {
    alert("Please scrape or load thumbnails first before running AI Text Removal.");
    return;
  }

  const s = getSettings();
  const w = clamp(toNumber(s.width, 210), 50, 4000);
  const h = clamp(toNumber(s.height, 264), 50, 4000);
  const btnAi = $("btnRunAiTextRemoval");
  const progWrap = $("progressBarWrap");
  const progLabel = $("progressLabel");
  const progCount = $("progressCount");
  const progPct = $("progressPercent");
  const progFill = $("progressFill");
  const progSub = $("progressSubdetail");

  const indices =
    singleItemIdx !== null
      ? [singleItemIdx]
      : batchItems.map((_, idx) => idx);

  if (btnAi) btnAi.disabled = true;
  if (progWrap) progWrap.classList.remove("hidden");

  try {
    for (let step = 0; step < indices.length; step++) {
      const idx = indices[step];
      const it = batchItems[idx];
      if (!it || !it.originalBase64) continue;

      const pct = Math.round(((step + 0.2) / indices.length) * 100);
      const label = `Running LaMa AI Text Removal (${step + 1} of ${indices.length}): ${it.game}…`;
      if (progLabel) progLabel.textContent = label;
      if (progCount) progCount.textContent = `${step + 1} / ${indices.length}`;
      if (progPct) progPct.textContent = `${pct}%`;
      if (progFill) progFill.style.width = `${pct}%`;
      if (progSub) progSub.textContent = `Segmenting character strokes & running neural LaMa ONNX inpainting…`;
      setGlobalProgress({ show: true, label, current: step + 1, total: indices.length, percent: pct });
      setStatus(label, true);
      await nextFrame();

      const res = await window.thumbupAPI.processLocalImage({
        imageBase64: it.originalBase64,
        width: w,
        height: h,
        removeFlatText: true,
        sensitivity: s.aiSensitivity,
      });

      if (res && res.ok) {
        it.cleanedBase64 = res.cleanedBase64;
        it.adaptiveColor = res.adaptiveColor || it.adaptiveColor;
        it.textWasRemoved = Boolean(res.textWasRemoved);
        it.removedTextItems = res.removedTextItems || [];
        it.outpaintedBase64 = null;
        it.outpaintCropKey = null;

        const cands = it.allCandidates || [];
        const selIdx = clamp(toNumber(it.selectedCandidateIdx, 0), 0, Math.max(0, cands.length - 1));
        if (cands[selIdx]) {
          cands[selIdx].cleanedBase64 = res.cleanedBase64;
          cands[selIdx].adaptiveColor = it.adaptiveColor;
          cands[selIdx].textWasRemoved = it.textWasRemoved;
          cands[selIdx].removedTextItems = it.removedTextItems;
        }
      }

      const donePct = Math.round(((step + 1) / indices.length) * 100);
      if (progPct) progPct.textContent = `${donePct}%`;
      if (progFill) progFill.style.width = `${donePct}%`;
      renderStep2LoadedMiniGrid();
      await nextFrame();
    }
    setStatus(`Completed AI Text Removal on ${indices.length} thumbnail(s).`);
    await refreshActiveStagePreview();
  } finally {
    if (btnAi) btnAi.disabled = false;
    setTimeout(() => {
      if (progWrap) progWrap.classList.add("hidden");
      setGlobalProgress({ show: false });
    }, 900);
  }
}

function renderStep2LoadedMiniGrid() {
  const container = $("step2LoadedList");
  $("loadedCountBadge").textContent = `${batchItems.length} game${batchItems.length === 1 ? "" : "s"}`;
  if (batchItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state-mini">
        <div style="font-size: 30px; margin-bottom: 8px;">⚡</div>
        <div>Click <strong>1. Scrape / Load Thumbnails</strong> to quickly fetch your games, switch versions with <strong>◀ / ▶</strong>, and click <strong>Run AI Text Removal</strong> when ready.</div>
      </div>`;
    return;
  }
  container.innerHTML = "";
  batchItems.forEach((it, itemIdx) => {
    const div = document.createElement("div");
    div.className = "mini-thumb-item";

    const cands =
      it.allCandidates && it.allCandidates.length > 0
        ? it.allCandidates
        : [
            {
              originalBase64: it.originalBase64,
              cleanedBase64: it.cleanedBase64 || it.originalBase64,
              adaptiveColor: it.adaptiveColor,
              textWasRemoved: it.textWasRemoved,
              removedTextItems: it.removedTextItems,
            },
          ];
    const selIdx = clamp(toNumber(it.selectedCandidateIdx, 0), 0, cands.length - 1);
    const activeCand = cands[selIdx] || cands[0];
    const src = activeCand.cleanedBase64 || activeCand.originalBase64 || "";
    const isCleaned = Boolean(activeCand.textWasRemoved);

    div.innerHTML = `
      <div class="mini-thumb-img-wrap">
        ${isCleaned ? `<div class="ai-badge removed">✨ Text Erased</div>` : ""}
        <img src="${src}" alt="${it.game}" />
      </div>
      <div class="ver-switcher-bar">
        <button type="button" class="ver-arrow-btn btn-prev-ver" ${cands.length <= 1 ? "disabled" : ""} title="Previous Version">◀</button>
        <span class="ver-counter-pill">Version ${selIdx + 1} / ${cands.length}</span>
        <button type="button" class="ver-arrow-btn btn-next-ver" ${cands.length <= 1 ? "disabled" : ""} title="Next Version">▶</button>
      </div>
      <div class="mini-thumb-prov">${it.provider || "Provider"}</div>
      <div class="mini-thumb-name" title="${it.game}">${it.game}</div>
      <div class="mini-actions-row">
        ${
          textRemovalMode === "manual"
            ? `<button type="button" class="mini-ai-clean-btn brush-main mini-brush-btn">🖌️ Brush Erase Text</button>`
            : `<button type="button" class="mini-ai-clean-btn mini-auto-btn ${isCleaned ? "done" : ""}">
                 ${isCleaned ? "✔ Re-run AI" : "✨ AI Remove Text"}
               </button>
               <button type="button" class="mini-icon-btn mini-brush-btn" title="Touch up manually with the brush eraser">🖌️</button>`
        }
      </div>
    `;

    const switchVersion = (delta) => {
      if (cands.length <= 1) return;
      const nextIdx = (selIdx + delta + cands.length) % cands.length;
      const chosen = cands[nextIdx];
      it.selectedCandidateIdx = nextIdx;
      it.originalBase64 = chosen.originalBase64;
      it.cleanedBase64 = chosen.cleanedBase64 || chosen.originalBase64;
      it.adaptiveColor = chosen.adaptiveColor || it.adaptiveColor;
      it.textWasRemoved = Boolean(chosen.textWasRemoved);
      it.removedTextItems = chosen.removedTextItems || [];
      it.outpaintedBase64 = null;
      it.outpaintCropKey = null;
      selectedPreviewItemIndex = itemIdx;
      renderStep2LoadedMiniGrid();
      setStatus(`Switched ${it.game} to Version ${nextIdx + 1} of ${cands.length}.`);
    };

    div.querySelector(".btn-prev-ver").onclick = (e) => {
      e.stopPropagation();
      switchVersion(-1);
    };
    div.querySelector(".btn-next-ver").onclick = (e) => {
      e.stopPropagation();
      switchVersion(1);
    };
    const autoBtn = div.querySelector(".mini-auto-btn");
    if (autoBtn) {
      autoBtn.onclick = (e) => {
        e.stopPropagation();
        runAiTextRemovalOnItems(itemIdx);
      };
    }
    div.querySelector(".mini-brush-btn").onclick = (e) => {
      e.stopPropagation();
      openBrushModal(itemIdx);
    };
    div.querySelector(".mini-thumb-img-wrap").onclick = () => {
      if (textRemovalMode === "manual") openBrushModal(itemIdx);
    };

    container.appendChild(div);
  });
}

// ---------- STEP 3: AI FILL EMPTY SPACE (GENERATIVE OUTPAINT WITH VARIANTS) ----------
async function runOutpaintEmptySpace(applyToAllItems = false) {
  captureStepEdits();
  if (batchItems.length === 0) {
    alert("Please load or scrape thumbnails in Step 2 first.");
    return;
  }

  const targetIndices = applyToAllItems
    ? batchItems.map((_, idx) => idx)
    : [clamp(selectedPreviewItemIndex, 0, batchItems.length - 1)];

  const btnSingle = $("btnAiFillEmptySpace");
  const btnAll = $("btnAiFillAllEmptySpace");
  const badge = $("outpaintVariantBadge");
  if (btnSingle) btnSingle.disabled = true;
  if (btnAll) btnAll.disabled = true;

  try {
    for (let i = 0; i < targetIndices.length; i++) {
      const idx = targetIndices[i];
      const item = batchItems[idx];
      if (!item) continue;
      if (!(item.cleanedBase64 || item.originalBase64)) continue;

      item.outpaintVariantSeed = (item.outpaintVariantSeed || 0) + 1;
      const seed = item.outpaintVariantSeed;

      if (badge) badge.textContent = `Generating Variant #${seed}…`;
      const pct = Math.round(((i + 0.3) / targetIndices.length) * 100);
      const msg = `AI Filling Empty Space (Variant #${seed}) for ${item.game}…`;
      setGlobalProgress({ show: true, label: msg, current: i + 1, total: targetIndices.length, percent: pct });
      setStatus(msg, true);
      await nextFrame();

      const ok = await generateOutpaintForItem(item, getItemEffectiveSettings(item), seed);
      if (ok && badge) badge.textContent = `Variant #${seed} Active (Click for #${seed + 1})`;
    }
    setStatus(`Filled empty frame space with AI extension!`);
    await refreshActiveStagePreview();
  } finally {
    if (btnSingle) btnSingle.disabled = false;
    if (btnAll) btnAll.disabled = false;
    setGlobalProgress({ show: false });
  }
}

// ---------- SHARED BRUSH ERASER (Step 2 Manual mode + Step 6 Review editor) ----------
function setupBrushCanvas(maskCanvas, sizeSliderId) {
  let drawing = false;
  let last = null;
  const getCoords = (e) => {
    const rect = maskCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (maskCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (maskCanvas.height / rect.height),
      scale: maskCanvas.width / Math.max(1, rect.width),
    };
  };
  const paint = (p) => {
    const ctx = maskCanvas.getContext("2d");
    const r = (toNumber($(sizeSliderId).value, 18) / 2) * p.scale;
    ctx.strokeStyle = "rgba(255, 70, 110, 0.6)";
    ctx.fillStyle = "rgba(255, 70, 110, 0.6)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = r * 2;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    last = p;
  };
  maskCanvas.addEventListener("mousedown", (e) => {
    drawing = true;
    last = null;
    paint(getCoords(e));
  });
  maskCanvas.addEventListener("mousemove", (e) => {
    if (drawing) paint(getCoords(e));
  });
  window.addEventListener("mouseup", () => {
    drawing = false;
    last = null;
  });
}

async function loadItemIntoBrushCanvases(item, imgCanvas, maskCanvas) {
  const img = await loadImageElement(item.cleanedBase64 || item.originalBase64);
  if (!img) return;
  imgCanvas.width = img.width;
  imgCanvas.height = img.height;
  maskCanvas.width = img.width;
  maskCanvas.height = img.height;
  imgCanvas.getContext("2d").drawImage(img, 0, 0);
  maskCanvas.getContext("2d").clearRect(0, 0, img.width, img.height);
}

/**
 * Inpaints the brushed mask on the item's base image and stores it everywhere the image is used
 * (item, selected scraped version, and regenerates any AI fill so the final render never shows stale text).
 */
async function applyBrushMaskToItem(item, imgCanvas, maskCanvas, settingsForOutpaint) {
  const mCtx = maskCanvas.getContext("2d");
  const mData = mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  let painted = 0;
  const binCanvas = document.createElement("canvas");
  binCanvas.width = maskCanvas.width;
  binCanvas.height = maskCanvas.height;
  const bCtx = binCanvas.getContext("2d");
  const outData = bCtx.createImageData(maskCanvas.width, maskCanvas.height);
  for (let i = 0; i < mData.data.length; i += 4) {
    const val = mData.data[i + 3] > 10 ? 255 : 0;
    if (val) painted++;
    outData.data[i] = val;
    outData.data[i + 1] = val;
    outData.data[i + 2] = val;
    outData.data[i + 3] = 255;
  }
  if (painted === 0) {
    alert("Paint over the text you want to erase first.");
    return false;
  }
  bCtx.putImageData(outData, 0, 0);

  const res = await window.thumbupAPI.inpaintCustomMask({
    imageBase64: imgCanvas.toDataURL("image/png"),
    maskBase64: binCanvas.toDataURL("image/png"),
  });
  if (!res || !res.ok) return false;

  const hadOutpaint = Boolean(item.outpaintedBase64);
  item.cleanedBase64 = res.cleanedBase64;
  item.adaptiveColor = res.adaptiveColor || item.adaptiveColor;
  item.textWasRemoved = true;
  const cands = item.allCandidates || [];
  const selIdx = clamp(toNumber(item.selectedCandidateIdx, 0), 0, Math.max(0, cands.length - 1));
  if (cands[selIdx]) {
    cands[selIdx].cleanedBase64 = res.cleanedBase64;
    cands[selIdx].textWasRemoved = true;
    cands[selIdx].adaptiveColor = item.adaptiveColor;
  }

  // Re-generate the AI fill from the newly erased base (same variant) so the erase is kept in the final image
  item.outpaintedBase64 = null;
  item.outpaintCropKey = null;
  item.outpaintSrcSig = null;
  if (hadOutpaint) {
    await generateOutpaintForItem(item, settingsForOutpaint || getItemEffectiveSettings(item), item.outpaintVariantSeed || 1);
  }

  const newImg = await loadImageElement(res.cleanedBase64);
  if (newImg) imgCanvas.getContext("2d").drawImage(newImg, 0, 0);
  mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  return true;
}

async function revertItemToOriginal(item) {
  if (!item || !item.originalBase64) return;
  const hadOutpaint = Boolean(item.outpaintedBase64);
  item.cleanedBase64 = item.originalBase64;
  item.textWasRemoved = false;
  const cands = item.allCandidates || [];
  const selIdx = clamp(toNumber(item.selectedCandidateIdx, 0), 0, Math.max(0, cands.length - 1));
  if (cands[selIdx]) {
    cands[selIdx].cleanedBase64 = item.originalBase64;
    cands[selIdx].textWasRemoved = false;
  }
  item.outpaintedBase64 = null;
  item.outpaintCropKey = null;
  item.outpaintSrcSig = null;
  if (hadOutpaint) {
    await generateOutpaintForItem(item, getItemEffectiveSettings(item), item.outpaintVariantSeed || 1);
  }
}

// ---------- STEP 2 MANUAL BRUSH MODAL ----------
async function openBrushModal(idx) {
  const item = batchItems[idx];
  if (!item) return;
  brushModalItemIdx = idx;
  $("brushModalTitle").textContent = `Brush Erase Text — ${item.provider ? item.provider + " · " : ""}${item.game}`;
  $("brushModal").classList.remove("hidden");
  await loadItemIntoBrushCanvases(item, $("brush2ImageCanvas"), $("brush2MaskCanvas"));
}

async function closeBrushModal() {
  $("brushModal").classList.add("hidden");
  brushModalItemIdx = -1;
  renderStep2LoadedMiniGrid();
  await refreshActiveStagePreview();
}

// ---------- STEP 3 & STEP 5 UI SYNC ----------
function syncStep3UI() {
  const fitVal = $("cropFitMode").value || "fit-both";
  document.querySelectorAll("#fitModeToggle .fit-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.fit === fitVal);
  });

  const alignVal = $("cropAlign").value || "center";
  document.querySelectorAll("#cropAlignCompass .compass-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.align === alignVal);
  });

  const rounded = $("enableCornerRounding").checked;
  $("cornerRoundingControls").classList.toggle("hidden", !rounded);
  if (rounded) {
    $("exportFormat").value = "png";
  }
}

function syncStep5UI() {
  const styleVal = $("overlayStyle").value;
  const gType = $("gradientType").value || "linear";
  const rSteps = $("radialColorSteps").value || "2";
  const rAlign = $("radialAlign").value || "bottom";

  document.querySelectorAll("#gradientTypeToggle .grad-type-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.gtype === gType);
  });

  document.querySelectorAll("#radialAlignCompass .compass-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.ralign === rAlign);
  });

  const usesGrad = ["dark-only", "dark-color", "multi-color", "adaptive"].includes(styleVal);
  $("gradientShapeBox").classList.toggle("hidden", !usesGrad);
  $("radialStepsContainer").classList.toggle("hidden", gType !== "radial" || !usesGrad);
  $("radialSecondColorBox").classList.toggle(
    "hidden",
    gType !== "radial" || rSteps !== "2" || styleVal === "dark-only"
  );

  $("overlayStandardSettings").classList.toggle("hidden", !usesGrad);
  $("overlayCustomSettings").classList.toggle("hidden", styleVal !== "dark-color");
  $("overlayMultiColorSettings").classList.toggle("hidden", styleVal !== "multi-color");
  $("overlayColorOpacityContainer").classList.toggle(
    "hidden",
    !["dark-color", "multi-color", "adaptive"].includes(styleVal)
  );
  $("overlayBlurSettings").classList.toggle("hidden", styleVal !== "progressive-blur");

  const innerOn = $("enableInnerStroke").checked;
  $("innerStrokeControls").classList.toggle("hidden", !innerOn);
  const sType = $("innerStrokeType").value || "linear";
  $("innerStrokeGradBox").classList.toggle("hidden", sType === "solid");
  $("innerStrokeAngleField").classList.toggle("hidden", sType !== "linear");
}

// ---------- STEP 6: 4-COLUMN REVIEW GRID & PER-ITEM EDITOR ----------
async function reRenderAllGalleryCards(showProgress = true) {
  const s = getBaseSettings();
  const palette = String(s.multiColors || "#FF0000, #2D9CDB, #27AE60")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9A-Fa-f]{6}$/i.test(c));

  const fmt = anyRoundedCorners() ? "png" : $("exportFormat").value || "png";
  const mime = fmt === "jpg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";

  const revWrap = $("reviewProgressWrap");
  if (showProgress && batchItems.length > 0 && revWrap) {
    revWrap.classList.remove("hidden");
  }

  for (let i = 0; i < batchItems.length; i++) {
    const item = batchItems[i];
    if (showProgress && revWrap) {
      const pct = Math.round(((i + 1) / batchItems.length) * 100);
      $("reviewProgressLabel").textContent = `Rendering production thumbnail (${i + 1} of ${batchItems.length}): ${item.game}…`;
      $("reviewProgressCount").textContent = `${i + 1} / ${batchItems.length}`;
      $("reviewProgressPercent").textContent = `${pct}%`;
      $("reviewProgressFill").style.width = `${pct}%`;
      if (batchItems.length > 2) await nextFrame();
    }
    if (!item.randColor && palette.length > 0) {
      item.randColor = palette[Math.floor(Math.random() * palette.length)];
    }
    const offCanvas = document.createElement("canvas");
    await renderThumbnailToCanvas(offCanvas, item, s);
    item.finalDataUrl = offCanvas.toDataURL(mime, 0.95);
  }

  if (revWrap) {
    setTimeout(() => revWrap.classList.add("hidden"), 450);
  }
  renderGalleryDOM();
}

function renderGalleryDOM() {
  const grid = $("galleryGrid");
  $("batchCountBadge").textContent = `${batchItems.length} thumbnail${batchItems.length === 1 ? "" : "s"}`;

  if (batchItems.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🖼️</div>
        <h3>No Thumbnails Loaded Yet</h3>
        <p>Go to <strong>Step 2 (Source & Scrape)</strong> to scrape thumbnails from a game list or load a local folder.</p>
      </div>`;
    return;
  }

  grid.innerHTML = "";
  batchItems.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "thumb-card";

    let displaySrc = item.finalDataUrl;
    if (galleryViewMode === "cleaned") {
      displaySrc = item.cleanedBase64 || item.originalBase64 || item.finalDataUrl;
    } else if (galleryViewMode === "original") {
      displaySrc = item.originalBase64 || item.cleanedBase64 || item.finalDataUrl;
    }

    const hasCustomOverrides = item.overrides && Object.keys(item.overrides).length > 0;
    const badgeLeft = item.textWasRemoved
      ? `<div class="ai-badge removed" title="Removed flat white text: ${(item.removedTextItems || []).join(", ")}">✨ Flat Text Erased</div>`
      : `<div class="ai-badge clean">✔ Ready</div>`;
    const badgeRight = hasCustomOverrides
      ? `<div class="ai-badge customized">Edited</div>`
      : "";

    card.innerHTML = `
      <div class="thumb-stage">
        ${badgeLeft}
        ${badgeRight}
        <img src="${displaySrc}" alt="${item.game}" />
      </div>
      <div class="thumb-meta">
        <div class="thumb-provider">${item.provider || "No Provider"}</div>
        <div class="thumb-title" title="${item.game}">${item.game}</div>
        <div class="thumb-actions">
          <button type="button" class="card-btn btn-edit-item" data-idx="${idx}">
            ✏️ Edit Crop / Font / Gradient
          </button>
        </div>
      </div>
    `;

    card.querySelector(".thumb-stage").onclick = () => openInspectorModal(idx);
    card.querySelector(".btn-edit-item").onclick = () => openInspectorModal(idx);
    grid.appendChild(card);
  });
}

// ---------- PER-THUMBNAIL EDITOR MODAL (STEP 6) ----------
let isDrawingMask = false;

async function openInspectorModal(idx) {
  activeModalItemIndex = idx;
  const item = batchItems[idx];
  if (!item) return;

  const base = getBaseSettings();
  const merged = Object.assign({}, base, item.overrides || {});
  tempModalOverrides = Object.assign({}, item.overrides || {});

  $("modalTitle").textContent = `Edit Individual Thumbnail #${idx + 1}: ${item.provider ? item.provider + " — " : ""}${item.game}`;

  // Populate Tab 1 (Crop & Fit)
  $("itemCropFitMode").value = merged.cropFitMode || "fit-both";
  $("itemCropAlign").value = merged.cropAlign || "center";
  $("itemCropOffsetX").value = merged.cropOffsetX || 0;
  $("itemCropOffsetY").value = merged.cropOffsetY || 0;
  $("itemCropZoom").value = merged.cropZoom || 100;

  // Populate Tab 2 (Typography)
  $("modalProviderInput").value = item.provider || "";
  $("modalGameInput").value = item.game || "";
  $("itemGameFont").innerHTML = $("gameFont").innerHTML;
  $("itemProviderFont").innerHTML = $("providerFont").innerHTML;
  $("itemGameFont").value = `${merged.gameFontFamily}|||${merged.gameFontStyle}`;
  $("itemProviderFont").value = `${merged.providerFontFamily}|||${merged.providerFontStyle}`;
  $("itemGameSizingMode").value = merged.gameSizingMode || "auto";
  $("itemGameFontSize").value = merged.gameFontSize || 32;
  $("itemProviderFontSize").value = merged.providerFontSize || 16;
  $("itemTextPlacement").value = merged.textPlacement || "down";
  $("itemProviderPosition").value = merged.providerPosition || "under";
  $("itemGameAllCaps").checked = Boolean(merged.gameAllCaps);
  $("itemProviderAllCaps").checked = Boolean(merged.providerAllCaps);
  $("itemMarginY").value = merged.marginY || 6;
  $("itemSpacing").value = merged.spacing || 7;

  // Populate Tab 3 (Gradient & Style)
  $("itemOverlayStyle").value = merged.overlayStyle || "dark-color";
  $("itemGradientType").value = merged.gradientType || "linear";
  $("itemRadialSteps").value = merged.radialColorSteps || "2";
  $("itemCustomColor").value = merged.customColor || "#2D9CDB";
  $("itemCustomOpacity").value = merged.customOpacity || 83;
  $("itemRadialColor2").value = merged.radialColor2 || "#0B0B14";
  if ($("itemRadialOpacity2")) $("itemRadialOpacity2").value = merged.radialOpacity2 || 75;
  if ($("itemRadialAlign")) $("itemRadialAlign").value = merged.radialAlign || "bottom";
  $("itemStandardOpacity").value = merged.standardOpacity || 40;

  // Prepare Magic Eraser Canvas
  const imgCanvas = $("eraserImageCanvas");
  const maskCanvas = $("eraserMaskCanvas");
  const src = item.cleanedBase64 || item.originalBase64;
  const img = await loadImageElement(src);
  const iw = img ? img.width : toNumber(base.width, 210);
  const ih = img ? img.height : toNumber(base.height, 264);
  imgCanvas.width = iw;
  imgCanvas.height = ih;
  maskCanvas.width = iw;
  maskCanvas.height = ih;
  const imgCtx = imgCanvas.getContext("2d");
  if (img) imgCtx.drawImage(img, 0, 0);
  maskCanvas.getContext("2d").clearRect(0, 0, iw, ih);

  // Populate Tab 4 (Alternative Images)
  const altContainer = $("modalAlternativesList");
  altContainer.innerHTML = "";
  const allChoices = [
    {
      originalBase64: item.originalBase64,
      cleanedBase64: item.cleanedBase64,
      adaptiveColor: item.adaptiveColor,
    },
    ...(item.alternatives || []),
  ].filter((c) => c.cleanedBase64 || c.originalBase64);

  allChoices.forEach((choice, cIdx) => {
    const div = document.createElement("div");
    div.className = "alt-thumb" + (cIdx === 0 ? " selected" : "");
    div.innerHTML = `<img src="${choice.cleanedBase64 || choice.originalBase64}" />`;
    div.onclick = async () => {
      item.originalBase64 = choice.originalBase64;
      item.cleanedBase64 = choice.cleanedBase64;
      item.adaptiveColor = choice.adaptiveColor || item.adaptiveColor;
      const newImg = await loadImageElement(item.cleanedBase64);
      if (newImg) {
        imgCanvas.width = newImg.width;
        imgCanvas.height = newImg.height;
        maskCanvas.width = newImg.width;
        maskCanvas.height = newImg.height;
        imgCtx.drawImage(newImg, 0, 0);
      }
      altContainer.querySelectorAll(".alt-thumb").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
      await updateModalLivePreview();
    };
    altContainer.appendChild(div);
  });

  await updateModalLivePreview();
  $("inspectorModal").classList.remove("hidden");
}

function collectModalOverrides() {
  const [gFam, gStyle] = ($("itemGameFont").value || "Montserrat|||Black").split("|||");
  const [pFam, pStyle] = ($("itemProviderFont").value || "Agency FB|||Regular").split("|||");
  return {
    cropFitMode: $("itemCropFitMode").value,
    cropAlign: $("itemCropAlign").value,
    cropOffsetX: $("itemCropOffsetX").value,
    cropOffsetY: $("itemCropOffsetY").value,
    cropZoom: $("itemCropZoom").value,
    gameFontFamily: gFam,
    gameFontStyle: gStyle,
    providerFontFamily: pFam,
    providerFontStyle: pStyle,
    gameSizingMode: $("itemGameSizingMode").value,
    gameFontSize: $("itemGameFontSize").value,
    providerFontSize: $("itemProviderFontSize").value,
    textPlacement: $("itemTextPlacement").value,
    providerPosition: $("itemProviderPosition").value,
    gameAllCaps: $("itemGameAllCaps").checked,
    providerAllCaps: $("itemProviderAllCaps").checked,
    marginY: $("itemMarginY").value,
    spacing: $("itemSpacing").value,
    overlayStyle: $("itemOverlayStyle").value,
    gradientType: $("itemGradientType").value,
    radialColorSteps: $("itemRadialSteps").value,
    customColor: $("itemCustomColor").value,
    customOpacity: $("itemCustomOpacity").value,
    radialColor2: $("itemRadialColor2").value,
    radialOpacity2: $("itemRadialOpacity2") ? $("itemRadialOpacity2").value : $("radialOpacity2").value,
    radialAlign: $("itemRadialAlign") ? $("itemRadialAlign").value : $("radialAlign").value,
    standardOpacity: $("itemStandardOpacity").value,
  };
}

async function updateModalLivePreview() {
  if (activeModalItemIndex < 0) return;
  const item = batchItems[activeModalItemIndex];
  if (!item) return;
  const previewItem = Object.assign({}, item, {
    provider: $("modalProviderInput").value.trim(),
    game: $("modalGameInput").value.trim(),
  });
  const ov = collectModalOverrides();
  await renderThumbnailToCanvas($("modalLiveFinalCanvas"), previewItem, getBaseSettings(), ov);
}

function anyRoundedCorners() {
  const base = getBaseSettings();
  if (base.enableCornerRounding) return true;
  return batchItems.some((it) => it.overrides && it.overrides.enableCornerRounding);
}

// ---------- STEP 7: SAVE & EXPORT UI ----------
function syncStep7ExportUI() {
  const rounded = anyRoundedCorners();
  $("optFormatJpg").disabled = rounded;
  $("optFormatWebp").disabled = rounded;
  if (rounded) {
    $("exportFormat").value = "png";
  }
  $("exportPngLockNotice").classList.toggle("hidden", !rounded);

  const fmt = ($("exportFormat").value || "png").toUpperCase();
  const modeLabel = saveMode === "hierarchy" ? "Hierarchy by Provider" : "Single Folder";
  $("exportSummaryBadge").textContent = `${modeLabel} • ${fmt}`;

  // Build live folder tree preview
  const tree = $("exportTreePreview");
  const outRoot = $("exportDirInput").value.trim() || "C:\\Exported_Thumbnails";
  const ext = fmt.toLowerCase();
  const naming = $("exportNaming").value;

  const sampleList =
    batchItems.length > 0
      ? batchItems
      : [
          { provider: "Pragmatic Play", game: "Gates of Olympus 1000" },
          { provider: "Pragmatic Play", game: "Sweet Bonanza" },
          { provider: "Relax Gaming", game: "Money Train 4" },
          { provider: "Hacksaw Gaming", game: "Rip City" },
        ];

  const formatFileName = (it) => {
    const p = it.provider || "Unknown Provider";
    const g = it.game || "Game";
    if (naming === "game-only") return `${g}.${ext}`;
    if (naming === "brackets") return `(${p}) ${g}.${ext}`;
    return `${p} - ${g}.${ext}`;
  };

  let html = `<div class="tree-folder">📂 ${outRoot}/</div>`;
  if (saveMode === "single") {
    sampleList.slice(0, 12).forEach((it) => {
      html += `<div class="tree-file">├── 🖼️ ${formatFileName(it)}</div>`;
    });
    if (sampleList.length > 12) {
      html += `<div class="tree-file">└── … (+${sampleList.length - 12} more files)</div>`;
    }
  } else {
    const byProv = new Map();
    sampleList.forEach((it) => {
      const p = it.provider || "Unknown Provider";
      if (!byProv.has(p)) byProv.set(p, []);
      byProv.get(p).push(it);
    });
    for (const [prov, items] of byProv.entries()) {
      html += `<div class="tree-folder" style="padding-left: 18px;">📁 ${prov}/</div>`;
      items.forEach((it) => {
        html += `<div class="tree-file" style="padding-left: 40px;">├── 🖼️ ${formatFileName(it)}</div>`;
      });
    }
  }
  tree.innerHTML = html;
}

// ---------- EVENT BINDINGS ----------
function linkSlider(sliderId, inputId) {
  if (!$(sliderId) || !$(inputId)) return;
  $(sliderId).oninput = () => {
    $(inputId).value = $(sliderId).value;
    refreshActiveStagePreview();
  };
  $(inputId).oninput = () => {
    $(sliderId).value = $(inputId).value;
    refreshActiveStagePreview();
  };
}

function renderPresets() {
  const current = $("sizePreset").value;
  $("sizePreset").innerHTML =
    '<option value="custom">Custom Configuration</option><option value="add-new">＋ Save current settings as preset…</option>';
  presets.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.width}×${p.height})`;
    $("sizePreset").appendChild(opt);
  });
  $("sizePreset").value = [...$("sizePreset").options].some((o) => o.value === current)
    ? current
    : "custom";
  const val = $("sizePreset").value;
  $("deletePreset").disabled = val === "custom" || val === "add-new" || !val;
}

window.addEventListener("DOMContentLoaded", async () => {
  // Link all sliders
  linkSlider("cropOffsetXSlider", "cropOffsetX");
  linkSlider("cropOffsetYSlider", "cropOffsetY");
  linkSlider("cropZoomSlider", "cropZoom");
  linkSlider("cornerRadiusSlider", "cornerRadius");
  linkSlider("marginXSlider", "marginX");
  linkSlider("marginYSlider", "marginY");
  linkSlider("spacingSlider", "spacing");
  linkSlider("maxTextHeightSlider", "maxTextHeight");
  linkSlider("radialRadiusSlider", "radialRadius");
  linkSlider("radialCenterXSlider", "radialCenterX");
  linkSlider("radialCenterYSlider", "radialCenterY");
  linkSlider("innerStrokeWidthSlider", "innerStrokeWidth");
  linkSlider("standardOpacitySlider", "standardOpacity");
  linkSlider("customOpacitySlider", "customOpacity");
  linkSlider("blurRadiusSlider", "blurRadius");

  setMultiColors("#FF0000, #2D9CDB, #27AE60");

  // Stepper Header Clicks & Footer Next/Prev
  document.querySelectorAll("#wizardStepper .step-tab").forEach((btn) => {
    btn.onclick = () => goToStep(Number(btn.dataset.step));
  });
  $("btnPrevStep").onclick = () => goToStep(currentStep - 1);
  $("btnNextStep").onclick = () => goToStep(currentStep + 1);

  // Step 1 Quick Ratio Buttons
  document.querySelectorAll(".quick-size-btn").forEach((btn) => {
    btn.onclick = () => {
      $("width").value = btn.dataset.w;
      $("height").value = btn.dataset.h;
      refreshActiveStagePreview();
    };
  });

  // Step 2 Source Method Cards
  const setSourceMethod = (mode) => {
    textMode = mode;
    $("methodCardScrape").classList.toggle("active", mode === "names");
    $("methodCardFolder").classList.toggle("active", mode === "folder");
    $("sourcePanelScrape").classList.toggle("hidden", mode !== "names");
    $("sourcePanelFolder").classList.toggle("hidden", mode !== "folder");
  };
  $("methodCardScrape").onclick = () => setSourceMethod("names");
  $("methodCardFolder").onclick = () => setSourceMethod("folder");

  $("btnLoadSample").onclick = () => {
    $("namesText").value = [
      "Pragmatic Play - Gates of Olympus 1000",
      "Pragmatic Play - Sweet Bonanza",
      "Relax Gaming - Money Train 4",
      "Hacksaw Gaming - Rip City",
    ].join("\n");
  };

  $("btnSelectLocalFolder").onclick = async () => {
    const res = await window.thumbupAPI.selectInputFolder();
    if (!res || res.canceled) return;
    localFolderFiles = (res.files || []).map(parseFolderFileEntry);
    $("folderStats").textContent = `${localFolderFiles.length} image(s) ready from folder "${res.folderName}"`;
  };

  $("btnFetchAndPrepare").onclick = () => runFetchAndPrepare();
  if ($("btnRunAiTextRemoval")) {
    $("btnRunAiTextRemoval").onclick = () => runAiTextRemovalOnItems(null);
  }

  // Step 3 AI Fill Empty Space (Generative Outpaint + Multi-Variant)
  if ($("btnAiFillEmptySpace")) {
    $("btnAiFillEmptySpace").onclick = () => runOutpaintEmptySpace(false);
  }
  if ($("btnAiFillAllEmptySpace")) {
    $("btnAiFillAllEmptySpace").onclick = () => runOutpaintEmptySpace(true);
  }
  if ($("btnResetAiFill")) {
    $("btnResetAiFill").onclick = async () => {
      const idx = clamp(selectedPreviewItemIndex, 0, Math.max(0, batchItems.length - 1));
      if (batchItems[idx]) {
        batchItems[idx].outpaintedBase64 = null;
        batchItems[idx].outpaintCropKey = null;
        batchItems[idx].outpaintVariantSeed = 0;
      }
      if ($("outpaintVariantBadge")) $("outpaintVariantBadge").textContent = "Click to Generate";
      setStatus("Reset AI empty space fill on current thumbnail.");
      await refreshActiveStagePreview();
    };
  }
  if ($("btnModalAiFillEmpty")) {
    $("btnModalAiFillEmpty").onclick = async () => {
      if (activeModalItemIndex < 0 || !batchItems[activeModalItemIndex]) return;
      const item = batchItems[activeModalItemIndex];
      const s = getItemEffectiveSettings(item, collectModalOverrides());

      item.outpaintVariantSeed = (item.outpaintVariantSeed || 0) + 1;
      const seed = item.outpaintVariantSeed;
      $("btnModalAiFillEmpty").disabled = true;
      $("btnModalAiFillEmpty").textContent = `⏳ Generating AI Fill Variant #${seed}…`;
      try {
        const ok = await generateOutpaintForItem(item, s, seed);
        if (ok) await updateModalLivePreview();
      } finally {
        $("btnModalAiFillEmpty").disabled = false;
        $("btnModalAiFillEmpty").textContent = `✨ Fill Empty Space with AI (Variant #${seed} • Click for #${seed + 1})`;
      }
    };
  }

  // Step 3 Fit Mode, Compass Alignment & Corner Rounding
  document.querySelectorAll("#fitModeToggle .fit-btn").forEach((btn) => {
    btn.onclick = () => {
      $("cropFitMode").value = btn.dataset.fit;
      syncStep3UI();
      refreshActiveStagePreview();
    };
  });

  document.querySelectorAll("#cropAlignCompass .compass-btn").forEach((btn) => {
    btn.onclick = () => {
      $("cropAlign").value = btn.dataset.align;
      syncStep3UI();
      refreshActiveStagePreview();
    };
  });

  $("enableCornerRounding").onchange = () => {
    syncStep3UI();
    refreshActiveStagePreview();
  };

  // Step 5 Gradient Type (Linear vs Radial 1-2 Steps) & Colors
  document.querySelectorAll("#gradientTypeToggle .grad-type-btn").forEach((btn) => {
    btn.onclick = () => {
      $("gradientType").value = btn.dataset.gtype;
      syncStep5UI();
      refreshActiveStagePreview();
    };
  });

  $("overlayStyle").onchange = () => {
    syncStep5UI();
    refreshActiveStagePreview();
  };

  $("radialColorSteps").onchange = () => {
    syncStep5UI();
    refreshActiveStagePreview();
  };

  $("customColor").oninput = (e) => {
    $("customHex").value = e.target.value;
    refreshActiveStagePreview();
  };
  $("customHex").oninput = (e) => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(e.target.value)) {
      $("customColor").value = e.target.value;
      refreshActiveStagePreview();
    }
  };

  $("radialColor2").oninput = (e) => {
    $("radialHex2").value = e.target.value;
    refreshActiveStagePreview();
  };
  $("radialHex2").oninput = (e) => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(e.target.value)) {
      $("radialColor2").value = e.target.value;
      refreshActiveStagePreview();
    }
  };

  // Radial Center Alignment Compass
  const rAlignMap = {
    "top-left": [15, 15],
    "top": [50, 15],
    "top-right": [85, 15],
    "left": [15, 50],
    "center": [50, 50],
    "right": [85, 50],
    "bottom-left": [15, 85],
    "bottom": [50, 85],
    "bottom-right": [85, 85],
  };
  document.querySelectorAll("#radialAlignCompass .compass-btn").forEach((btn) => {
    btn.onclick = () => {
      const a = btn.dataset.ralign;
      $("radialAlign").value = a;
      if (rAlignMap[a]) {
        $("radialCenterX").value = rAlignMap[a][0];
        $("radialCenterXSlider").value = rAlignMap[a][0];
        $("radialCenterY").value = rAlignMap[a][1];
        $("radialCenterYSlider").value = rAlignMap[a][1];
      }
      syncStep5UI();
      refreshActiveStagePreview();
    };
  });

  // Inner Stroke (Size, Solid Color & Gradient Options)
  $("enableInnerStroke").onchange = () => {
    syncStep5UI();
    refreshActiveStagePreview();
  };
  $("innerStrokeType").onchange = () => {
    syncStep5UI();
    refreshActiveStagePreview();
  };
  $("innerStrokeAngle").onchange = () => {
    refreshActiveStagePreview();
  };
  $("innerStrokeColor1").oninput = (e) => {
    $("innerStrokeHex1").value = e.target.value;
    refreshActiveStagePreview();
  };
  $("innerStrokeHex1").oninput = (e) => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(e.target.value)) {
      $("innerStrokeColor1").value = e.target.value;
      refreshActiveStagePreview();
    }
  };
  $("innerStrokeColor2").oninput = (e) => {
    $("innerStrokeHex2").value = e.target.value;
    refreshActiveStagePreview();
  };
  $("innerStrokeHex2").oninput = (e) => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(e.target.value)) {
      $("innerStrokeColor2").value = e.target.value;
      refreshActiveStagePreview();
    }
  };

  $("btnAddMultiColor").onclick = () => {
    $("multiColorContainer").appendChild(createMultiColorRow("#2D9CDB"));
    refreshActiveStagePreview();
  };

  // Step 6 View Mode Pills & Reset Overrides
  document.querySelectorAll("#viewModeGroup .view-pill").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#viewModeGroup .view-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      galleryViewMode = btn.dataset.view;
      renderGalleryDOM();
    };
  });

  $("btnResetAllOverrides").onclick = async () => {
    batchItems.forEach((it) => {
      it.overrides = {};
    });
    await reRenderAllGalleryCards();
  };

  // Step 7 Save Mode Cards & Export
  $("saveCardSingle").onclick = () => {
    saveMode = "single";
    $("saveCardSingle").classList.add("active");
    $("saveCardHierarchy").classList.remove("active");
    syncStep7ExportUI();
  };
  $("saveCardHierarchy").onclick = () => {
    saveMode = "hierarchy";
    $("saveCardHierarchy").classList.add("active");
    $("saveCardSingle").classList.remove("active");
    syncStep7ExportUI();
  };

  $("exportNaming").onchange = () => syncStep7ExportUI();
  $("exportFormat").onchange = () => syncStep7ExportUI();

  $("btnPickExportDir").onclick = async () => {
    const res = await window.thumbupAPI.selectExportFolder();
    if (res && !res.canceled && res.folderPath) {
      $("exportDirInput").value = res.folderPath;
      syncStep7ExportUI();
    }
  };

  $("btnExportAll").onclick = async () => {
    if (batchItems.length === 0) {
      alert("No thumbnails loaded yet! Please load or scrape thumbnails in Step 2 first.");
      return;
    }

    const expWrap = $("exportProgressWrap");
    const expLabel = $("exportProgressLabel");
    const expCount = $("exportProgressCount");
    const expPct = $("exportProgressPercent");
    const expFill = $("exportProgressFill");
    const expSub = $("exportProgressSubdetail");

    $("btnExportAll").disabled = true;
    expWrap.classList.remove("hidden");

    try {
      const s = getBaseSettings();
      const fmt = anyRoundedCorners() ? "png" : $("exportFormat").value;
      const mime = fmt === "jpg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";

      // Phase 1: Render each final image with progress bar feedback
      for (let i = 0; i < batchItems.length; i++) {
        const it = batchItems[i];
        const pct = Math.round(((i + 1) / (batchItems.length + 1)) * 100);
        const msg = `Rendering final high-res output (${i + 1} of ${batchItems.length}): ${it.game}…`;
        expLabel.textContent = msg;
        expCount.textContent = `${i + 1} / ${batchItems.length}`;
        expPct.textContent = `${pct}%`;
        expFill.style.width = `${pct}%`;
        expSub.textContent = `Format: ${fmt.toUpperCase()} • Mode: ${saveMode === "hierarchy" ? "Provider Folder Hierarchy" : "Single Folder"}`;
        setGlobalProgress({ show: true, label: msg, current: i + 1, total: batchItems.length, percent: pct });
        await nextFrame();

        const offCanvas = document.createElement("canvas");
        await renderThumbnailToCanvas(offCanvas, it, s);
        it.finalDataUrl = offCanvas.toDataURL(mime, 0.95);
      }

      // Phase 2: Write files to disk
      expLabel.textContent = `Saving ${batchItems.length} files to disk…`;
      expPct.textContent = "95%";
      expFill.style.width = "95%";
      await nextFrame();

      const res = await window.thumbupAPI.exportThumbnails({
        outputDir: $("exportDirInput").value.trim() || null,
        saveMode,
        format: fmt,
        namingPattern: $("exportNaming").value,
        openFolderAfter: true,
        items: batchItems.map((it) => ({
          provider: it.provider,
          game: it.game,
          dataUrl: it.finalDataUrl,
        })),
      });

      if (res && res.ok) {
        $("exportDirInput").value = res.outputDir;
        expLabel.textContent = `Export Complete! Saved ${res.savedCount} thumbnail(s).`;
        expPct.textContent = "100%";
        expFill.style.width = "100%";
        expSub.textContent = `Saved to: ${res.outputDir}`;
        setGlobalProgress({ show: true, label: expLabel.textContent, current: res.savedCount, total: res.savedCount, percent: 100 });
        syncStep7ExportUI();
        setStatus(
          `Exported ${res.savedCount} thumbnail(s) to ${res.outputDir} (${
            saveMode === "hierarchy" ? "Hierarchy by Provider" : "Single Folder"
          })`
        );
      }
    } finally {
      $("btnExportAll").disabled = false;
      setTimeout(() => {
        expWrap.classList.add("hidden");
        setGlobalProgress({ show: false });
      }, 1500);
    }
  };

  // Presets
  $("sizePreset").onchange = () => {
    const val = $("sizePreset").value;
    $("addPresetBox").classList.toggle("hidden", val !== "add-new");
    $("deletePreset").disabled = val === "custom" || val === "add-new" || !val;
    const found = presets.find((p) => p.id === val);
    if (found) applySettings(found);
  };

  $("savePreset").onclick = async () => {
    const name = $("presetName").value.trim();
    if (!name) return;
    const s = getSettings();
    s.name = name;
    const res = await window.thumbupAPI.savePreset(s);
    if (res && res.ok) {
      presets = res.presets || [];
      renderPresets();
      $("presetName").value = "";
      $("addPresetBox").classList.add("hidden");
    }
  };

  $("deletePreset").onclick = async () => {
    const id = $("sizePreset").value;
    if (!id || id === "custom" || id === "add-new") return;
    const res = await window.thumbupAPI.deletePreset(id);
    if (res && res.ok) {
      presets = res.presets || [];
      $("sizePreset").value = "custom";
      renderPresets();
    }
  };

  // Generic change listeners for live preview
  document
    .querySelectorAll(
      "#stepView1 input, #stepView3 input, #stepView4 input, #stepView4 select, #stepView5 input"
    )
    .forEach((el) => {
      // Exclude elements with dedicated async/loading listeners to avoid duplicate competing renders
      if (
        el.id === "gameFont" ||
        el.id === "providerFont" ||
        el.id === "enableCornerRounding" ||
        (el.id && el.id.startsWith("applyAll"))
      ) {
        return;
      }
      el.addEventListener("input", () => {
        if (el.id === "gameSizingMode") $("gameFontSize").disabled = el.value !== "manual";
        refreshActiveStagePreview();
      });
      el.addEventListener("change", () => {
        if (el.id === "gameSizingMode") $("gameFontSize").disabled = el.value !== "manual";
        refreshActiveStagePreview();
      });
    });

  // Modal Tabs & Events
  document.querySelectorAll(".iedit-tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".iedit-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.itab;
      $("itabPaneCrop").classList.toggle("hidden", target !== "crop");
      $("itabPaneFont").classList.toggle("hidden", target !== "font");
      $("itabPaneGrad").classList.toggle("hidden", target !== "grad");
      $("itabPaneSwap").classList.toggle("hidden", target !== "swap");
    };
  });

  $("btnModalStageFinal").onclick = () => {
    $("btnModalStageFinal").classList.add("active");
    $("btnModalStageEraser").classList.remove("active");
    $("modalFinalPreviewWrap").classList.remove("hidden");
    $("modalEraserWrap").classList.add("hidden");
  };
  $("btnModalStageEraser").onclick = () => {
    $("btnModalStageEraser").classList.add("active");
    $("btnModalStageFinal").classList.remove("active");
    $("modalEraserWrap").classList.remove("hidden");
    $("modalFinalPreviewWrap").classList.add("hidden");
  };

  document
    .querySelectorAll(
      "#itabPaneCrop input, #itabPaneCrop select, #itabPaneFont input, #itabPaneFont select, #itabPaneGrad input, #itabPaneGrad select"
    )
    .forEach((el) => {
      el.addEventListener("input", () => updateModalLivePreview());
      el.addEventListener("change", () => updateModalLivePreview());
    });

  $("btnResetSingleItem").onclick = async () => {
    if (activeModalItemIndex >= 0 && batchItems[activeModalItemIndex]) {
      batchItems[activeModalItemIndex].overrides = {};
      await openInspectorModal(activeModalItemIndex);
    }
  };

  $("btnSaveModalChanges").onclick = async () => {
    if (activeModalItemIndex >= 0 && batchItems[activeModalItemIndex]) {
      const it = batchItems[activeModalItemIndex];
      it.provider = $("modalProviderInput").value.trim();
      it.game = $("modalGameInput").value.trim();
      it.overrides = collectModalOverrides();
      await reRenderAllGalleryCards();
    }
    $("inspectorModal").classList.add("hidden");
  };

  $("btnCloseModal").onclick = async () => {
    $("inspectorModal").classList.add("hidden");
    // Brush erases are applied immediately, so always refresh the review grid when closing
    await reRenderAllGalleryCards(false);
  };

  // Setup Magic Eraser Brush inside Review Modal (shared brush engine)
  const maskCanvas = $("eraserMaskCanvas");
  setupBrushCanvas(maskCanvas, "brushSizeSlider");
  $("btnClearBrush").onclick = () => {
    maskCanvas.getContext("2d").clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  };
  $("btnApplyBrushErase").onclick = async () => {
    if (activeModalItemIndex < 0) return;
    const item = batchItems[activeModalItemIndex];
    $("btnApplyBrushErase").disabled = true;
    const mProg = $("modalEraserProgressWrap");
    if (mProg) mProg.classList.remove("hidden");
    try {
      const ok = await applyBrushMaskToItem(
        item,
        $("eraserImageCanvas"),
        maskCanvas,
        getItemEffectiveSettings(item, collectModalOverrides())
      );
      if (ok) {
        await updateModalLivePreview();
        await reRenderAllGalleryCards(false);
      }
    } finally {
      $("btnApplyBrushErase").disabled = false;
      if (mProg) mProg.classList.add("hidden");
    }
  };
  $("btnRevertToOriginal").onclick = async () => {
    if (activeModalItemIndex < 0) return;
    const item = batchItems[activeModalItemIndex];
    await revertItemToOriginal(item);
    await loadItemIntoBrushCanvases(item, $("eraserImageCanvas"), maskCanvas);
    await updateModalLivePreview();
  };

  // Step 2 Manual Brush Modal
  const b2Mask = $("brush2MaskCanvas");
  setupBrushCanvas(b2Mask, "brush2SizeSlider");
  $("btnBrush2Clear").onclick = () => b2Mask.getContext("2d").clearRect(0, 0, b2Mask.width, b2Mask.height);
  $("btnBrush2Apply").onclick = async () => {
    const item = batchItems[brushModalItemIdx];
    if (!item) return;
    $("btnBrush2Apply").disabled = true;
    $("brush2ProgressWrap").classList.remove("hidden");
    try {
      await applyBrushMaskToItem(item, $("brush2ImageCanvas"), b2Mask);
    } finally {
      $("btnBrush2Apply").disabled = false;
      $("brush2ProgressWrap").classList.add("hidden");
    }
  };
  $("btnBrush2Revert").onclick = async () => {
    const item = batchItems[brushModalItemIdx];
    if (!item) return;
    await revertItemToOriginal(item);
    await loadItemIntoBrushCanvases(item, $("brush2ImageCanvas"), b2Mask);
  };
  $("btnBrush2Done").onclick = () => closeBrushModal();
  $("btnBrush2Close").onclick = () => closeBrushModal();

  // Step 2 Text Removal Mode (Auto AI vs Manual Brush)
  const setTextRemovalMode = (mode) => {
    textRemovalMode = mode;
    document.querySelectorAll("#textRemovalModeToggle button").forEach((b) => {
      b.classList.toggle("active", b.dataset.trmode === mode);
    });
    $("autoRemovalPanel").classList.toggle("hidden", mode !== "auto");
    $("manualRemovalPanel").classList.toggle("hidden", mode !== "manual");
    renderStep2LoadedMiniGrid();
  };
  document.querySelectorAll("#textRemovalModeToggle button").forEach((b) => {
    b.onclick = () => setTextRemovalMode(b.dataset.trmode);
  });

  // Steps 3–5 "Apply to all thumbnails" checkboxes
  ["applyAllStep3", "applyAllStep4", "applyAllStep5"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.onchange = () => {
      applyToAll = el.checked;
      syncApplyAllCheckboxes();
      if (applyToAll) {
        // When user enables "Apply to all", sync current DOM directly to baseSettings and clear item overrides
        const dom = getSettings();
        if (!baseSettings) baseSettings = {};
        STEP_EDIT_KEYS.forEach((k) => {
          baseSettings[k] = dom[k];
          batchItems.forEach((it) => {
            if (it.overrides) delete it.overrides[k];
          });
        });
        lastDomSnapshot = dom;
        refreshActiveStagePreview();
      } else {
        captureStepEdits();
      }
      setStatus(applyToAll ? "Edits now apply to ALL thumbnails." : "Edits now apply only to the selected thumbnail.");
    };
  });
  syncApplyAllCheckboxes();

  // Grow the window when new options appear instead of showing a scrollbar
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => scheduleAutoFit());
    document.querySelectorAll(".stage-config-card").forEach((card) => {
      Array.from(card.children).forEach((child) => ro.observe(child));
    });
  }


  // Load initial settings & all installed system fonts from Electron + Chromium Local Font Access
  const fontFileMap = new Map();

  const populateAllFontDropdowns = async (baseFonts) => {
    const mergedMap = new Map();
    const addFontObj = (f) => {
      if (!f || !f.family) return;
      const style = f.style || "Regular";
      const key = `${f.family}|||${style}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, { family: f.family, style, filePath: f.filePath || "" });
      }
      if (f.filePath) {
        fontFileMap.set(key, f.filePath);
      }
    };

    (baseFonts || []).forEach(addFontObj);

    // Also query Chromium's Local Font Access API if available
    if (typeof window.queryLocalFonts === "function") {
      try {
        const localFaces = await window.queryLocalFonts();
        for (const lf of localFaces) {
          addFontObj({ family: lf.family, style: lf.style || "Regular", filePath: "" });
        }
      } catch (e) {}
    }

    const sortedFonts = Array.from(mergedMap.values()).sort((a, b) =>
      a.family.localeCompare(b.family) || a.style.localeCompare(b.style)
    );

    const fillSelect = (selectEl, defaultVal) => {
      if (!selectEl) return;
      const prevVal = selectEl.value || defaultVal;
      selectEl.innerHTML = "";
      sortedFonts.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = `${f.family}|||${f.style}`;
        opt.textContent = `${f.family} (${f.style})`;
        opt.style.fontFamily = `"${f.family}", sans-serif`;
        selectEl.appendChild(opt);
      });
      if ([...selectEl.options].some((o) => o.value === prevVal)) {
        selectEl.value = prevVal;
      } else if ([...selectEl.options].some((o) => o.value === defaultVal)) {
        selectEl.value = defaultVal;
      }
    };

    fillSelect($("gameFont"), "Montserrat|||Black");
    fillSelect($("providerFont"), "Agency FB|||Regular");
    if ($("systemFontsCountBadge")) {
      $("systemFontsCountBadge").textContent = `✔ ${sortedFonts.length} Installed System Font Styles Available`;
    }
  };

  const ensureSelectedFontsLoaded = async () => {
    for (const selId of ["gameFont", "providerFont", "itemGameFont", "itemProviderFont"]) {
      const el = $(selId);
      if (el && el.value && fontFileMap.has(el.value)) {
        const [fam, st] = el.value.split("|||");
        await ensureSystemFontLoaded(fam, st, fontFileMap.get(el.value));
      }
    }
  };

  $("gameFont").addEventListener("change", async () => {
    await ensureSelectedFontsLoaded();
    await refreshActiveStagePreview();
  });
  $("providerFont").addEventListener("change", async () => {
    await ensureSelectedFontsLoaded();
    await refreshActiveStagePreview();
  });

  if ($("btnRefreshSystemFonts")) {
    $("btnRefreshSystemFonts").onclick = async () => {
      setStatus("Scanning installed system fonts…", true);
      const fRes = await window.thumbupAPI.getSystemFonts();
      if (fRes && fRes.fonts) {
        await populateAllFontDropdowns(fRes.fonts);
        await ensureSelectedFontsLoaded();
        await refreshActiveStagePreview();
        setStatus(`Refreshed system fonts (${fRes.fonts.length} font styles found).`);
      }
    };
  }

  const initData = await window.thumbupAPI.getInitData();
  if (initData) {
    await populateAllFontDropdowns(initData.fonts || []);
    presets = initData.presets || [];
    renderPresets();
    if (initData.latest && Object.keys(initData.latest).length > 0) {
      initData.latest.cropFitMode = "fit-both";
      applySettings(initData.latest);
    }
    await ensureSelectedFontsLoaded();
  }

  window.__ensureSelectedFontsLoaded = ensureSelectedFontsLoaded;
  baseSettings = pickKeys(getSettings(), STEP_EDIT_KEYS);
  lastDomSnapshot = getSettings();

  await goToStep(1);
});
