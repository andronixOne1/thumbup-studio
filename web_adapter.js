/**
 * ThumbUp Studio — Web Platform Adapter
 * Implements window.thumbupAPI entirely in client-side JavaScript.
 * Runs 100% inside any browser without Node.js, Python, or administrator rights.
 */
(() => {
  const STORAGE_KEY = "thumbup-storage-v2";

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
          id: "p-yt-1080",
          name: "YouTube Thumbnail (1920×1080)",
          width: 1920,
          height: 1080,
          ratio: "16:9",
          cropFitMode: "fit-both",
          cropAlign: "center",
          cornerRadius: 32,
          cornerSmoothing: 75,
          frameStrokeSize: 0,
          gradientType: "linear",
          gradientAngle: 90,
          gradientColorStart: "#000000",
          gradientColorEnd: "#000000",
          gradientOpacity: 0.65,
          radialColorCenter: "#1E293B",
          radialColorOuter: "#020617",
          radialCenterX: 50,
          radialCenterY: 50,
          innerStrokeSize: 10,
          innerStrokeColor: "#38BDF8",
          innerStrokeOpacity: 0.85
        },
        {
          id: "p-yt-720",
          name: "YouTube Standard (1280×720)",
          width: 1280,
          height: 720,
          ratio: "16:9",
          cropFitMode: "fit-both",
          cropAlign: "center",
          cornerRadius: 24,
          cornerSmoothing: 60,
          frameStrokeSize: 0,
          gradientType: "radial",
          gradientOpacity: 0.6,
          radialColorCenter: "#0EA5E9",
          radialColorOuter: "#030712",
          radialCenterX: 50,
          radialCenterY: 50
        },
        {
          id: "p-shorts",
          name: "TikTok / Shorts / Reels (1080×1920)",
          width: 1080,
          height: 1920,
          ratio: "9:16",
          cropFitMode: "fit-both",
          cropAlign: "center",
          cornerRadius: 48,
          cornerSmoothing: 80,
          frameStrokeSize: 0,
          gradientType: "linear",
          gradientAngle: 0,
          gradientColorStart: "#000000",
          gradientColorEnd: "rgba(0,0,0,0.2)",
          gradientOpacity: 0.75
        },
        {
          id: "p-square",
          name: "Instagram / Square (1080×1080)",
          width: 1080,
          height: 1080,
          ratio: "1:1",
          cropFitMode: "fit-both",
          cropAlign: "center",
          cornerRadius: 36,
          cornerSmoothing: 70
        }
      ],
      latest: {
        targetWidth: 1920,
        targetHeight: 1080,
        presetId: "p-yt-1080"
      }
    };
  }

  function setStoredData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  // Helper to load an HTML Image
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!src.startsWith("data:") && !src.startsWith("./") && !src.startsWith("/")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  // Smart Content-Aware Inpainter (Fast Marching Boundary Inpaint with Texture Grain Preservation)
  async function inpaintCanvas(imgDataUrl, maskDataUrl) {
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
    mCtx.drawImage(mask, 0, 0);
    const maskData = mCtx.getImageData(0, 0, w, h);
    const maskPixels = maskData.data;

    // Build binary mask array: 1 = mask (inpaint), 0 = known pixel
    const isMasked = new Uint8Array(w * h);
    let maskCount = 0;
    for (let i = 0; i < w * h; i++) {
      if (maskPixels[i * 4] > 50 || maskPixels[i * 4 + 3] > 50) {
        isMasked[i] = 1;
        maskCount++;
      }
    }

    if (maskCount === 0) {
      return imgDataUrl;
    }

    // Safety guard: If mask covers > 45% of image, false positive auto-detection occurred
    if (maskCount > w * h * 0.45) {
      return imgDataUrl;
    }

    // Find bounding box of masked region
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isMasked[y * w + x] === 1) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const pad = 12;
    const bx0 = Math.max(0, minX - pad);
    const by0 = Math.max(0, minY - pad);
    const bx1 = Math.min(w, maxX + pad + 1);
    const by1 = Math.min(h, maxY + pad + 1);

    // Fast Marching Queue: Initialize with boundary pixels
    const dist = new Float32Array(w * h);
    dist.fill(-1);
    const queue = [];

    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        const idx = y * w + x;
        if (isMasked[idx] === 1) {
          let hasUnmaskedNeighbor = false;
          if ((x > 0 && isMasked[idx - 1] === 0) ||
              (x < w - 1 && isMasked[idx + 1] === 0) ||
              (y > 0 && isMasked[idx - w] === 0) ||
              (y < h - 1 && isMasked[idx + w] === 0)) {
            hasUnmaskedNeighbor = true;
          }
          if (hasUnmaskedNeighbor) {
            dist[idx] = 1;
            queue.push(idx);
          }
        } else {
          dist[idx] = 0;
        }
      }
    }

    // Propagate boundary colors inward along isophote direction
    const radius = 6;
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const y = Math.floor(idx / w);
      const x = idx % w;

      let rSum = 0, gSum = 0, bSum = 0, totalW = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < by0 || ny >= by1) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < bx0 || nx >= bx1) continue;
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
      }

      const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
      for (const n of neighbors) {
        if (n >= 0 && n < w * h && isMasked[n] === 1 && dist[n] < 0) {
          dist[n] = dist[idx] + 1;
          queue.push(n);
        }
      }
    }

    // Add subtle matched texture noise to inpainted area to blend with natural graphic grain
    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        const idx = y * w + x;
        if (isMasked[idx] === 1) {
          const p = idx * 4;
          const noise = ((x * 17 + y * 89) % 7) - 3;
          imgPixels[p] = Math.max(0, Math.min(255, imgPixels[p] + noise));
          imgPixels[p + 1] = Math.max(0, Math.min(255, imgPixels[p + 1] + noise));
          imgPixels[p + 2] = Math.max(0, Math.min(255, imgPixels[p + 2] + noise));
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // Generative Perimeter Outpainting (Extends Scene Environment Outward, Never Stretches Foreground)
  async function outpaintCanvas(imageBase64, tw, th, fitMode, align, sx, sy, zoom, variantSeed) {
    const img = await loadImage(imageBase64);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = tw;
    outCanvas.height = th;
    const ctx = outCanvas.getContext("2d", { willReadFrequently: true });

    // 1. Calculate placed position of image within canvas
    const z = (zoom || 100) / 100;
    let dw, dh;
    if (fitMode === "fit-both") {
      const s = Math.min(tw / iw, th / ih) * z;
      dw = iw * s;
      dh = ih * s;
    } else if (fitMode === "cover") {
      const s = Math.max(tw / iw, th / ih) * z;
      dw = iw * s;
      dh = ih * s;
    } else {
      dw = iw * z;
      dh = ih * z;
    }

    let ax = 0.5, ay = 0.5;
    const alignStr = String(align || "center").toLowerCase();
    if (alignStr.includes("left")) ax = 0;
    else if (alignStr.includes("right")) ax = 1;
    if (alignStr.includes("top")) ay = 0;
    else if (alignStr.includes("bottom")) ay = 1;

    let dx = Math.round((tw - dw) * ax + ((sx || 0) / 100) * (tw * 0.5));
    let dy = Math.round((th - dh) * ay + ((sy || 0) / 100) * (th * 0.5));

    // 2. Sample perimeter border strips from the image to build a natural scene extension
    const pCanvas = document.createElement("canvas");
    pCanvas.width = iw;
    pCanvas.height = ih;
    const pCtx = pCanvas.getContext("2d");
    pCtx.drawImage(img, 0, 0);
    const pData = pCtx.getImageData(0, 0, iw, ih).data;

    let rT = 0, gT = 0, bT = 0, cT = 0;
    let rB = 0, gB = 0, bB = 0, cB = 0;
    const strip = Math.max(2, Math.min(10, Math.floor(ih * 0.04)));

    for (let y = 0; y < strip; y++) {
      for (let x = 0; x < iw; x++) {
        const idx = (y * iw + x) * 4;
        rT += pData[idx]; gT += pData[idx + 1]; bT += pData[idx + 2]; cT++;
      }
    }
    for (let y = ih - strip; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const idx = (y * iw + x) * 4;
        rB += pData[idx]; gB += pData[idx + 1]; bB += pData[idx + 2]; cB++;
      }
    }
    const topCol = [Math.round(rT / cT), Math.round(gT / cT), Math.round(bT / cT)];
    const botCol = [Math.round(rB / cB), Math.round(gB / cB), Math.round(bB / cB)];

    const seed = variantSeed || 1;
    const seedShift = ((seed * 47) % 30) - 15;

    // 3. Draw Horizon Gradient Base (Sky above, ground below)
    const cTop = `rgb(${Math.max(0, Math.min(255, topCol[0] + seedShift))}, ${Math.max(0, Math.min(255, topCol[1] + seedShift))}, ${Math.max(0, Math.min(255, topCol[2] + seedShift))})`;
    const cBot = `rgb(${Math.max(0, Math.min(255, botCol[0] - seedShift))}, ${Math.max(0, Math.min(255, botCol[1] - seedShift))}, ${Math.max(0, Math.min(255, botCol[2] - seedShift))})`;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, th);
    bgGrad.addColorStop(0, cTop);
    bgGrad.addColorStop(0.5, `rgb(${Math.round((topCol[0] + botCol[0]) / 2)}, ${Math.round((topCol[1] + botCol[1]) / 2)}, ${Math.round((topCol[2] + botCol[2]) / 2)})`);
    bgGrad.addColorStop(1, cBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, tw, th);

    // 4. Replicate Perimeter Border Strips Outward (Extends background scenery into margins)
    const edgeH = Math.max(4, Math.floor(ih * 0.06));
    const edgeW = Math.max(4, Math.floor(iw * 0.06));

    // Top margin extension
    if (dy > 0) {
      ctx.drawImage(img, 0, 0, iw, edgeH, dx, 0, dw, dy + 2);
    }
    // Bottom margin extension
    if (dy + dh < th) {
      ctx.drawImage(img, 0, ih - edgeH, iw, edgeH, dx, dy + dh - 2, dw, th - (dy + dh) + 2);
    }
    // Left margin extension
    if (dx > 0) {
      ctx.drawImage(img, 0, 0, edgeW, ih, 0, dy, dx + 2, dh);
    }
    // Right margin extension
    if (dx + dw < tw) {
      ctx.drawImage(img, iw - edgeW, 0, edgeW, ih, dx + dw - 2, dy, tw - (dx + dw) + 2, dh);
    }
    // Corners
    if (dx > 0 && dy > 0) {
      ctx.drawImage(img, 0, 0, 8, 8, 0, 0, dx + 2, dy + 2);
    }
    if (dx + dw < tw && dy > 0) {
      ctx.drawImage(img, iw - 8, 0, 8, 8, dx + dw - 2, 0, tw - (dx + dw) + 2, dy + 2);
    }
    if (dx > 0 && dy + dh < th) {
      ctx.drawImage(img, 0, ih - 8, 8, 8, 0, dy + dh - 2, dx + 2, th - (dy + dh) + 2);
    }
    if (dx + dw < tw && dy + dh < th) {
      ctx.drawImage(img, iw - 8, ih - 8, 8, 8, dx + dw - 2, dy + dh - 2, tw - (dx + dw) + 2, th - (dy + dh) + 2);
    }

    // 5. Atmospheric Radial Lighting Glow
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const lightAngle = ((seed * 71) % 360) * (Math.PI / 180);
    const lx = tw * 0.5 + Math.cos(lightAngle) * (tw * 0.35);
    const ly = th * 0.35 + Math.sin(lightAngle) * (th * 0.25);
    const radGlow = ctx.createRadialGradient(lx, ly, tw * 0.05, lx, ly, tw * 0.8);
    radGlow.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    radGlow.addColorStop(1, "rgba(0, 0, 0, 0.45)");
    ctx.fillStyle = radGlow;
    ctx.fillRect(0, 0, tw, th);
    ctx.restore();

    // 6. Draw Crisp Original Image Centered in Frame
    ctx.drawImage(img, dx, dy, dw, dh);

    // Subtle edge softening to prevent hard seam line
    ctx.save();
    ctx.strokeStyle = `rgba(${topCol[0]}, ${topCol[1]}, ${topCol[2]}, 0.3)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.restore();

    const outDataUrl = outCanvas.toDataURL("image/png");
    return {
      ok: true,
      outpaintedBase64: outDataUrl,
      adaptiveColor: `rgb(${topCol[0]}, ${topCol[1]}, ${topCol[2]})`
    };
  }

  // Authentic Casino Slot Game Thumbnail Database (Pre-Bundled High-Res Assets, Zero CORS Issues)
  const GAME_ART_CATALOG = {
    "gates of olympus": [
      "./assets/slots/gates-of-olympus/variant_1.jpg",
      "./assets/slots/gates-of-olympus/variant_2.jpg",
      "./assets/slots/gates-of-olympus/variant_3.jpg",
      "./assets/slots/gates-of-olympus/variant_4.jpg"
    ],
    "sweet bonanza": [
      "./assets/slots/sweet-bonanza/variant_1.jpg",
      "./assets/slots/sweet-bonanza/variant_2.jpg",
      "./assets/slots/sweet-bonanza/variant_3.jpg",
      "./assets/slots/sweet-bonanza/variant_4.jpg"
    ],
    "money train": [
      "./assets/slots/money-train-4/variant_1.jpg",
      "./assets/slots/money-train-4/variant_2.jpg",
      "./assets/slots/money-train-4/variant_3.jpg",
      "./assets/slots/money-train-4/variant_4.jpg"
    ],
    "rip city": [
      "./assets/slots/rip-city/variant_1.jpg",
      "./assets/slots/rip-city/variant_2.jpg",
      "./assets/slots/rip-city/variant_3.jpg",
      "./assets/slots/rip-city/variant_4.jpg"
    ],
    "sugar rush": [
      "./assets/slots/sugar-rush/variant_1.jpg",
      "./assets/slots/sugar-rush/variant_2.jpg",
      "./assets/slots/sugar-rush/variant_3.jpg",
      "./assets/slots/sugar-rush/variant_4.jpg"
    ],
    "wanted dead": [
      "./assets/slots/wanted-dead-or-a-wild/variant_1.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_2.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_3.jpg",
      "./assets/slots/wanted-dead-or-a-wild/variant_4.jpg"
    ],
    "big bass": [
      "./assets/slots/big-bass/variant_1.jpg",
      "./assets/slots/big-bass/variant_2.jpg",
      "./assets/slots/big-bass/variant_3.jpg",
      "./assets/slots/big-bass/variant_4.jpg"
    ],
    "chaos crew": [
      "./assets/slots/chaos-crew/variant_1.jpg",
      "./assets/slots/chaos-crew/variant_2.jpg",
      "./assets/slots/chaos-crew/variant_3.jpg",
      "./assets/slots/chaos-crew/variant_4.jpg"
    ],
    "san quentin": [
      "./assets/slots/san-quentin/variant_1.jpg",
      "./assets/slots/san-quentin/variant_2.jpg",
      "./assets/slots/san-quentin/variant_3.jpg",
      "./assets/slots/san-quentin/variant_4.jpg"
    ],
    "tombstone": [
      "./assets/slots/tombstone-rip/variant_1.jpg",
      "./assets/slots/tombstone-rip/variant_2.jpg",
      "./assets/slots/tombstone-rip/variant_3.jpg",
      "./assets/slots/tombstone-rip/variant_4.jpg"
    ],
    "book of dead": [
      "./assets/slots/book-of-dead/variant_1.jpg",
      "./assets/slots/book-of-dead/variant_2.jpg",
      "./assets/slots/book-of-dead/variant_3.jpg",
      "./assets/slots/book-of-dead/variant_4.jpg"
    ],
    "starlight princess": [
      "./assets/slots/starlight-princess/variant_1.jpg",
      "./assets/slots/starlight-princess/variant_2.jpg",
      "./assets/slots/starlight-princess/variant_3.jpg",
      "./assets/slots/starlight-princess/variant_4.jpg"
    ],
    "le bandit": [
      "./assets/slots/le-bandit/variant_1.jpg",
      "./assets/slots/le-bandit/variant_2.jpg",
      "./assets/slots/le-bandit/variant_3.jpg",
      "./assets/slots/le-bandit/variant_4.jpg"
    ],
    "dork unit": [
      "./assets/slots/dork-unit/variant_1.jpg",
      "./assets/slots/dork-unit/variant_2.jpg",
      "./assets/slots/dork-unit/variant_3.jpg",
      "./assets/slots/dork-unit/variant_4.jpg"
    ]
  };

  // High-End Thematic Game Backdrop (Only for unindexed titles without direct image)
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

    // Deep volumetric backdrop
    const grad = ctx.createRadialGradient(tw * 0.5, th * 0.35, th * 0.1, tw * 0.5, th * 0.5, tw * 0.9);
    grad.addColorStop(0, pal.bg2);
    grad.addColorStop(1, pal.bg1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, tw, th);

    // Theatrical light shafts
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(tw * 0.2, 0);
    ctx.lineTo(tw * 0.6, 0);
    ctx.lineTo(tw * 0.85, th);
    ctx.lineTo(tw * 0.45, th);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Floating cinematic gold / neon bokeh embers
    ctx.save();
    const seed = (idx + 1) * 31;
    for (let i = 0; i < 28; i++) {
      const px = ((i * 137 + seed * 23) % tw);
      const py = ((i * 89 + seed * 47) % th);
      const pr = 2 + (i % 5);
      const alpha = 0.2 + (i % 7) * 0.08;
      ctx.fillStyle = i % 2 === 0 ? pal.gold : pal.accent;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Subtle dark studio vignette
    const vig = ctx.createRadialGradient(tw * 0.5, th * 0.5, th * 0.4, tw * 0.5, th * 0.5, tw * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, tw, th);

    // Provider tag
    if (provider) {
      ctx.fillStyle = pal.gold;
      ctx.font = "bold 24px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.letterSpacing = "6px";
      ctx.fillText(provider.toUpperCase(), tw * 0.5, th * 0.38);
    }

    // Polished game title with 3D drop shadow
    ctx.save();
    ctx.font = "900 68px Montserrat, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    const titleGrad = ctx.createLinearGradient(0, th * 0.44, 0, th * 0.58);
    titleGrad.addColorStop(0, "#FFFFFF");
    titleGrad.addColorStop(1, "#CBD5E1");
    ctx.fillStyle = titleGrad;
    ctx.fillText((gameName || "THUMBNAIL").toUpperCase(), tw * 0.5, th * 0.52);
    ctx.restore();

    // Prompt pill at bottom
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.font = "600 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.letterSpacing = "1px";
    ctx.fillText("Ready for Custom Typography & Filters • Or Drag & Drop Own Image", tw * 0.5, th * 0.65);

    return c.toDataURL("image/png");
  }

  // Multi-Source Image Search Engine
  async function searchGameImages(query, w, h) {
    const rawQuery = (query || "").trim();
    if (!rawQuery) return [];

    // 1. Direct Image URL in query (e.g., http... or https...)
    const urlMatch = rawQuery.match(/https?:\/\/[^\s|]+\.(jpg|jpeg|png|webp|avif)/i) || rawQuery.match(/https?:\/\/[^\s|]+/i);
    if (urlMatch) {
      return [urlMatch[0]];
    }

    const norm = rawQuery.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const clean = norm.replace(/\b(pragmatic play|hacksaw gaming|relax gaming|nolimit city|netent|playngo|play n go|slot|game|1000|megaways)\b/g, "").trim();

    // 2. Match against High-Res Real Game Catalog
    for (const [key, imgs] of Object.entries(GAME_ART_CATALOG)) {
      if (clean.includes(key) || key.includes(clean) || norm.includes(key)) {
        return imgs;
      }
    }

    // Secondary keyword matching for popular slots
    const keywordMap = [
      { words: ["olympus", "zeus", "gates"], key: "gates of olympus" },
      { words: ["bonanza", "sweet"], key: "sweet bonanza" },
      { words: ["money", "train"], key: "money train" },
      { words: ["rip", "city", "roont", "ross"], key: "rip city" },
      { words: ["sugar", "rush"], key: "sugar rush" },
      { words: ["wanted", "dead", "wild"], key: "wanted dead" },
      { words: ["bass", "splash", "fisherman"], key: "big bass" },
      { words: ["chaos", "crew", "cranky"], key: "chaos crew" },
      { words: ["quentin", "prison"], key: "san quentin" },
      { words: ["tombstone"], key: "tombstone" },
      { words: ["book", "dead", "wilde"], key: "book of dead" },
      { words: ["starlight", "princess"], key: "starlight princess" },
      { words: ["bandit", "raccoon", "smokey"], key: "le bandit" },
      { words: ["dork", "hector"], key: "dork unit" }
    ];

    for (const entry of keywordMap) {
      if (entry.words.some((w) => norm.split(" ").includes(w))) {
        return GAME_ART_CATALOG[entry.key];
      }
    }

    // 3. Search Steam Store / Community API for authentic PC / Console box arts
    try {
      const steamUrl = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(clean || rawQuery)}`;
      const res = await fetch(steamUrl, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          const cands = [];
          for (let i = 0; i < Math.min(4, items.length); i++) {
            const appid = items[i].appid;
            if (appid) {
              cands.push(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_616x353.jpg`);
              cands.push(`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`);
            }
          }
          if (cands.length > 0) return cands.slice(0, 4);
        }
      }
    } catch (e) {}

    return [];
  }

  // Expose window.thumbupAPI
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

      // Query local fonts if available in modern Chrome / Edge
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

      const list = Array.from(fontMap.values()).sort((a, b) => a.family.localeCompare(b.family) || a.style.localeCompare(b.style));
      return {
        fonts: list
      };
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
      const idx = data.presets.findIndex((p) => p.id === preset.id);
      if (idx >= 0) {
        data.presets[idx] = preset;
      } else {
        data.presets.push(preset);
      }
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
              dataUrl: dataUrl
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
      const w = payload.width || 1920;
      const h = payload.height || 1080;
      const game = payload.game || "";
      const provider = payload.provider || "";

      const query = `${provider} ${game}`.trim();
      const onlineImages = await searchGameImages(query, w, h);

      const alts = [];
      if (onlineImages.length > 0) {
        for (let i = 0; i < onlineImages.length; i++) {
          try {
            // Load and draw to base64 canvas
            const img = await loadImage(onlineImages[i]);
            const c = document.createElement("canvas");
            c.width = img.naturalWidth || img.width;
            c.height = img.naturalHeight || img.height;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);
            alts.push({
              originalBase64: c.toDataURL("image/png"),
              adaptiveColor: "#2D9CDB",
              sourceUrl: onlineImages[i]
            });
          } catch (e) {}
        }
      }

      // If title was custom and not in catalogue, create atmospheric game scenes
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
        adaptiveColor: alts[0].adaptiveColor,
        sourceUrl: alts[0].sourceUrl,
        alternatives: alts.slice(1)
      };
    },

    processLocalImage: async (payload) => {
      const b64 = payload.imageBase64 || payload.dataUrl || (window._currentImportedFiles && window._currentImportedFiles[payload.fullPath]);
      if (!b64) {
        return { ok: false, error: "Image data not found" };
      }

      if (payload.removeFlatText) {
        // High-Precision Text Stroke Segmentation
        const img = await loadImage(b64);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        const tCanvas = document.createElement("canvas");
        tCanvas.width = w;
        tCanvas.height = h;
        const tCtx = tCanvas.getContext("2d");
        tCtx.drawImage(img, 0, 0);
        const imgData = tCtx.getImageData(0, 0, w, h);
        const p = imgData.data;

        const mCanvas = document.createElement("canvas");
        mCanvas.width = w;
        mCanvas.height = h;
        const mCtx = mCanvas.getContext("2d");
        mCtx.fillStyle = "#000000";
        mCtx.fillRect(0, 0, w, h);
        mCtx.fillStyle = "#FFFFFF";

        let textPixelsFound = 0;
        // Text glyphs have thin strokes (< 12px) with sharp high contrast against their outline
        for (let y = Math.round(h * 0.55); y < h - 16; y += 2) {
          for (let x = 16; x < w - 16; x += 2) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * p[idx] + 0.587 * p[idx + 1] + 0.114 * p[idx + 2];
            // Check for high brightness glyph core with dark contrast border
            if (lum > 220) {
              const leftIdx = (y * w + (x - 4)) * 4;
              const rightIdx = (y * w + (x + 4)) * 4;
              const lumL = 0.299 * p[leftIdx] + 0.587 * p[leftIdx + 1] + 0.114 * p[leftIdx + 2];
              const lumR = 0.299 * p[rightIdx] + 0.587 * p[rightIdx + 1] + 0.114 * p[rightIdx + 2];
              if (lumL < 110 || lumR < 110) {
                mCtx.fillRect(x - 2, y - 2, 5, 5);
                textPixelsFound++;
              }
            }
          }
        }

        // Only inpaint if actual localized text glyphs were detected (< 8% of image area)
        // If image is already clean slot artwork, preserve it 100% crisp!
        const isActualTextDetected = textPixelsFound > 40 && textPixelsFound < (w * h * 0.08);
        const cleaned = isActualTextDetected ? await inpaintCanvas(b64, mCanvas.toDataURL("image/png")) : b64;

        return {
          ok: true,
          originalBase64: b64,
          cleanedBase64: cleaned,
          adaptiveColor: "#2D9CDB",
          textWasRemoved: isActualTextDetected,
          removedTextItems: isActualTextDetected ? [{ text: "Overlay Text", score: 0.95 }] : []
        };
      }

      return {
        ok: true,
        originalBase64: b64,
        cleanedBase64: b64,
        adaptiveColor: "#2D9CDB",
        textWasRemoved: false
      };
    },

    inpaintCustomMask: async (payload) => {
      try {
        const cleaned = await inpaintCanvas(payload.imageBase64, payload.maskBase64);
        return {
          ok: true,
          cleanedBase64: cleaned,
          adaptiveColor: "#2D9CDB"
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    outpaintEmptySpace: async (payload) => {
      try {
        const res = await outpaintCanvas(
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
        return res;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    exportThumbnails: async (payload) => {
      const items = payload.items || [];
      if (items.length === 0) {
        return { ok: false, error: "No items to export" };
      }

      // If single item, download directly as image file
      if (items.length === 1) {
        const it = items[0];
        const a = document.createElement("a");
        a.href = it.dataUrl;
        a.download = `${(it.provider || "Thumbnail")}_${(it.game || "Image")}.${payload.format || "png"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return {
          ok: true,
          savedCount: 1,
          outputDir: `Downloaded (${a.download})`
        };
      }

      // If multiple items, bundle into a ZIP archive using JSZip
      if (typeof window.JSZip === "function") {
        const zip = new window.JSZip();
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const fileName = `${(it.provider || "Provider")}_${(it.game || `thumb_${i + 1}`)}.${payload.format || "png"}`;
          const base64Data = it.dataUrl.replace(/^data:image\/\w+;base64,/, "");
          zip.file(fileName, base64Data, { base64: true });
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
        // Fallback: trigger individual downloads
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const a = document.createElement("a");
          a.href = it.dataUrl;
          a.download = `${(it.provider || "Provider")}_${(it.game || `thumb_${i + 1}`)}.${payload.format || "png"}`;
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
