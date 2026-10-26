// Draws the Math Buddy mark (brand-600 rounded tile, white ÷) as PNG/ICO.
// Run: node scripts/generate-icons.mjs
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BRAND = [37, 99, 235];
const WHITE = [255, 255, 255];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0, 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

/** Signed distance to a rounded rect filling the canvas. Negative is inside. */
function sdRoundRect(px, py, size, radius) {
  const half = size / 2 - radius;
  const qx = Math.abs(px - size / 2) - half;
  const qy = Math.abs(py - size / 2) - half;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function paint(size, { bleed, radius }) {
  const rgba = new Uint8Array(size * size * 4);
  const samples = 4;
  const n = samples * samples;
  const barThick = size * 0.078;
  const barLen = size * 0.46;
  const dotR = size * 0.065;
  const gap = size * 0.058;
  const dotOff = barThick / 2 + gap + dotR;
  const cx = size / 2;
  const cy = size / 2;

  const insideSymbol = (px, py) => {
    const dx = Math.abs(px - cx);
    const inBar = dx <= barLen / 2 && Math.abs(py - cy) <= barThick / 2;
    if (inBar) return true;
    if (Math.hypot(px - cx, py - (cy - dotOff)) <= dotR) return true;
    if (Math.hypot(px - cx, py - (cy + dotOff)) <= dotR) return true;
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const inTile = bleed || sdRoundRect(px, py, size, radius) <= 0;
          if (!inTile) continue;
          covered++;
          const color = insideSymbol(px, py) ? WHITE : BRAND;
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }
      if (!covered) continue;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round((covered / n) * 255);
    }
  }
  return rgba;
}

function writePng(path, size, options) {
  const png = encodePng(size, size, paint(size, options));
  writeFileSync(path, png);
  return png;
}

mkdirSync(iconsDir, { recursive: true });
const rounded = (size) => ({ bleed: false, radius: size * 0.22 });
const fullBleed = { bleed: true, radius: 0 };

writePng(join(iconsDir, "icon-192.png"), 192, rounded(192));
writePng(join(iconsDir, "icon-512.png"), 512, rounded(512));
writePng(join(iconsDir, "icon-maskable-192.png"), 192, fullBleed);
writePng(join(iconsDir, "icon-maskable-512.png"), 512, fullBleed);
const apple = writePng(join(iconsDir, "apple-touch-icon.png"), 180, fullBleed);
writeFileSync(join(root, "public", "apple-touch-icon.png"), apple);
const favicon = encodePng(32, 32, paint(32, rounded(32)));
writeFileSync(join(root, "public", "favicon.ico"), encodeIco(favicon));

console.log("Wrote Math Buddy icons to public/icons, public/apple-touch-icon.png, and public/favicon.ico");
