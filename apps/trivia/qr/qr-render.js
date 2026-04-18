// ATLAS-branded QR code renderer.
// Imports the QR encoder from qr-encode.js and png-encode.js.

const path = require('path');
const fs = require('fs');
const { buildQrMatrix } = require('./qr-encode');
const { encodePngRgba, fillPixel, decodePngRgba } = require('./png-encode');

// ─── ATLAS theme colors ─────────────────────────────────────────────────────────

const BG = { r: 0x06, g: 0x06, b: 0x0a };
const MODULE = { r: 0xff, g: 0x44, b: 0x11 };
const FINDER = { r: 0xff, g: 0x66, b: 0x00 };
const GLOW_INNER = { r: 0xff, g: 0x55, b: 0x22 };
const BORDER_COLOR = { r: 0xff, g: 0x55, b: 0x11 };

// ─── Load and cache the ATLAS logo PNG ──────────────────────────────────────────

let _logoCached = null;

function loadLogo() {
  if (_logoCached) return _logoCached;
  const logoPath = path.join(__dirname, 'atlas-logo.png');
  const logoPng = fs.readFileSync(logoPath);
  _logoCached = decodePngRgba(logoPng);
  return _logoCached;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isFinderModule(row, col, moduleCount) {
  if (row < 7 && col < 7) return true;
  if (row < 7 && col >= moduleCount - 7) return true;
  if (row >= moduleCount - 7 && col < 7) return true;
  return false;
}

function blendGlow(buf, x, y, w, h, r, g, b, intensity) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const idx = (y * w + x) * 4;
  if (idx < 0 || idx + 3 >= buf.length) return;
  buf[idx] = Math.min(255, buf[idx] + Math.round(r * intensity));
  buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(g * intensity));
  buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(b * intensity));
}

function isInRect(row, col, centerRow, centerCol, halfW, halfH) {
  return row >= centerRow - halfH && row <= centerRow + halfH &&
         col >= centerCol - halfW && col <= centerCol + halfW;
}

/** Bilinear sample from RGBA source buffer. */
function sampleBilinear(src, srcW, srcH, fx, fy) {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, srcW - 1);
  const y1 = Math.min(y0 + 1, srcH - 1);
  const dx = fx - x0;
  const dy = fy - y0;

  const idx00 = (y0 * srcW + x0) * 4;
  const idx10 = (y0 * srcW + x1) * 4;
  const idx01 = (y1 * srcW + x0) * 4;
  const idx11 = (y1 * srcW + x1) * 4;

  const out = [];
  for (let ch = 0; ch < 4; ch++) {
    const v00 = src[idx00 + ch];
    const v10 = src[idx10 + ch];
    const v01 = src[idx01 + ch];
    const v11 = src[idx11 + ch];
    const top = v00 + (v10 - v00) * dx;
    const bot = v01 + (v11 - v01) * dx;
    out.push(Math.round(top + (bot - top) * dy));
  }
  return out;
}

// ─── Renderer ───────────────────────────────────────────────────────────────────

/** Render a QR code PNG with ATLAS branding (center logo inset). Returns a raw PNG Buffer. */
function renderAtlasQrPng(input, opts) {
  if (!opts) opts = {};
  const scale = opts.scale || 48;
  const marginModules = opts.marginModules || 2;
  const { matrix, moduleCount } = buildQrMatrix(input);

  const imgSize = (moduleCount + marginModules * 2) * scale;
  const buf = Buffer.alloc(imgSize * imgSize * 4);

  // ── Compute inset dimensions from logo aspect ratio ───────────────────────
  const logo = loadLogo();
  const logoAspect = logo.width / logo.height;

  // Target inset: fit logo nicely with thin border padding
  const insetPad = Math.round(scale * 0.4);
  const targetPxW = Math.round(logo.width * (scale / 16)) + insetPad * 2;
  const targetPxH = Math.round(logo.height * (scale / 16)) + insetPad * 2;

  let insetModW = Math.ceil(targetPxW / scale);
  let insetModH = Math.ceil(targetPxH / scale);
  if (insetModW % 2 === 0) insetModW++;
  if (insetModH % 2 === 0) insetModH++;

  // Cap at 25% of module count per axis
  const maxMod = (n) => Math.floor(n * 0.25) | 1;
  if (insetModW > maxMod(moduleCount)) insetModW = maxMod(moduleCount);
  if (insetModH > maxMod(moduleCount)) insetModH = maxMod(moduleCount);

  const centerMod = Math.floor(moduleCount / 2);
  const halfW = Math.floor(insetModW / 2);
  const halfH = Math.floor(insetModH / 2);

  // ── Dark background ───────────────────────────────────────────────────────
  for (let y = 0; y < imgSize; y++) {
    for (let x = 0; x < imgSize; x++) {
      fillPixel(buf, x, y, imgSize, BG.r, BG.g, BG.b, 255);
    }
  }

  // ── Neon glow pass (behind modules, skip inset) ───────────────────────────
  const glowRadius = Math.max(4, Math.round(scale * 0.45));
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[row][col] !== 1) continue;
      if (isInRect(row, col, centerMod, centerMod, halfW, halfH)) continue;
      const px = (col + marginModules) * scale;
      const py = (row + marginModules) * scale;
      for (let dy = -glowRadius; dy <= scale + glowRadius; dy++) {
        for (let dx = -glowRadius; dx <= scale + glowRadius; dx++) {
          if (dx >= 0 && dx < scale && dy >= 0 && dy < scale) continue;
          const distX = dx < 0 ? -dx : dx >= scale ? dx - scale + 1 : 0;
          const distY = dy < 0 ? -dy : dy >= scale ? dy - scale + 1 : 0;
          const dist = Math.sqrt(distX * distX + distY * distY);
          if (dist > glowRadius) continue;
          const t = 1 - dist / glowRadius;
          blendGlow(
            buf, px + dx, py + dy, imgSize, imgSize,
            GLOW_INNER.r, GLOW_INNER.g, GLOW_INNER.b, 0.15 * t * t,
          );
        }
      }
    }
  }

  // ── Solid QR modules (skip inset) ─────────────────────────────────────────
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[row][col] !== 1) continue;
      if (isInRect(row, col, centerMod, centerMod, halfW, halfH)) continue;
      const px = (col + marginModules) * scale;
      const py = (row + marginModules) * scale;
      const color = isFinderModule(row, col, moduleCount) ? FINDER : MODULE;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          fillPixel(buf, px + dx, py + dy, imgSize, color.r, color.g, color.b, 255);
        }
      }
    }
  }

  // ── Center inset: dark fill + thin solid border ───────────────────────────
  const insetLeft = (centerMod - halfW + marginModules) * scale;
  const insetTop = (centerMod - halfH + marginModules) * scale;
  const insetPxW = insetModW * scale;
  const insetPxH = insetModH * scale;
  const borderThick = Math.max(2, Math.round(scale * 0.08));

  // Fill inset background
  for (let dy = 0; dy < insetPxH; dy++) {
    for (let dx = 0; dx < insetPxW; dx++) {
      fillPixel(buf, insetLeft + dx, insetTop + dy, imgSize, BG.r, BG.g, BG.b, 255);
    }
  }

  // Draw thin solid border
  for (let dy = -borderThick; dy < insetPxH + borderThick; dy++) {
    for (let dx = -borderThick; dx < insetPxW + borderThick; dx++) {
      const inside = dx >= 0 && dx < insetPxW && dy >= 0 && dy < insetPxH;
      if (inside) continue;
      const bx = insetLeft + dx;
      const by = insetTop + dy;
      if (bx < 0 || by < 0 || bx >= imgSize || by >= imgSize) continue;
      fillPixel(buf, bx, by, imgSize, BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b, 255);
    }
  }

  // ── Composite logo into center inset (bilinear scaling) ───────────────────
  const logoDstW = insetPxW - insetPad * 2;
  const logoDstH = insetPxH - insetPad * 2;
  const logoLeft = Math.round(insetLeft + (insetPxW - logoDstW) / 2);
  const logoTop = Math.round(insetTop + (insetPxH - logoDstH) / 2);

  for (let dy = 0; dy < logoDstH; dy++) {
    for (let dx = 0; dx < logoDstW; dx++) {
      const srcX = (dx / logoDstW) * (logo.width - 1);
      const srcY = (dy / logoDstH) * (logo.height - 1);
      const [r, g, b, a] = sampleBilinear(logo.data, logo.width, logo.height, srcX, srcY);
      if (a < 10) continue;
      const px = logoLeft + dx;
      const py = logoTop + dy;
      if (a >= 250) {
        fillPixel(buf, px, py, imgSize, r, g, b, 255);
      } else {
        // Alpha blend
        const idx = (py * imgSize + px) * 4;
        if (idx < 0 || idx + 3 >= buf.length) continue;
        const af = a / 255;
        buf[idx] = Math.round(r * af + buf[idx] * (1 - af));
        buf[idx + 1] = Math.round(g * af + buf[idx + 1] * (1 - af));
        buf[idx + 2] = Math.round(b * af + buf[idx + 2] * (1 - af));
        buf[idx + 3] = 255;
      }
    }
  }

  return encodePngRgba(buf, imgSize, imgSize);
}

module.exports = { renderAtlasQrPng };
