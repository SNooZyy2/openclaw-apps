// Minimal PNG encoder for generating simple RGBA images without native dependencies.
// Ported from openclaw src/media/png-encode.ts — CommonJS, no types.

const { deflateSync } = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** Compute CRC32 checksum for a buffer (used in PNG chunk encoding). */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Create a PNG chunk with type, data, and CRC. */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Write a pixel to an RGBA buffer. Ignores out-of-bounds writes. */
function fillPixel(buf, x, y, width, r, g, b, a) {
  if (a === undefined) a = 255;
  if (x < 0 || y < 0 || x >= width) {
    return;
  }
  const idx = (y * width + x) * 4;
  if (idx < 0 || idx + 3 >= buf.length) {
    return;
  }
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

/** Encode an RGBA buffer as a PNG image. */
function encodePngRgba(buffer, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rawOffset = row * (stride + 1);
    raw[rawOffset] = 0; // filter: none
    buffer.copy(raw, rawOffset + 1, row * stride, row * stride + stride);
  }
  const compressed = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Minimal PNG RGBA decoder (only node:zlib) ─────────────────────────────────

const { inflateSync } = require('node:zlib');

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode a PNG file buffer into { data: Buffer (RGBA), width, height }. Only supports 8-bit RGBA/RGB PNGs. */
function decodePngRgba(pngBuf) {
  if (pngBuf[0] !== 0x89 || pngBuf[1] !== 0x50) throw new Error('Not a PNG');

  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idatChunks = [];

  while (offset < pngBuf.length) {
    const len = pngBuf.readUInt32BE(offset);
    const type = pngBuf.slice(offset + 4, offset + 8).toString('ascii');
    const data = pngBuf.slice(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);

  const srcBpp = colorType === 6 ? 4 : 3;
  const stride = width * srcBpp;
  const out = Buffer.alloc(width * height * 4);

  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    const filter = raw[rowOff];
    const row = raw.slice(rowOff + 1, rowOff + 1 + stride);

    for (let i = 0; i < stride; i++) {
      const a = i >= srcBpp ? row[i - srcBpp] : 0;
      const b = y > 0 ? prev[i] : 0;
      const c = (i >= srcBpp && y > 0) ? prev[i - srcBpp] : 0;

      switch (filter) {
        case 0: break;
        case 1: row[i] = (row[i] + a) & 0xff; break;
        case 2: row[i] = (row[i] + b) & 0xff; break;
        case 3: row[i] = (row[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: row[i] = (row[i] + paethPredictor(a, b, c)) & 0xff; break;
      }
    }
    row.copy(prev);

    for (let x = 0; x < width; x++) {
      const si = x * srcBpp;
      const di = (y * width + x) * 4;
      out[di] = row[si];
      out[di + 1] = row[si + 1];
      out[di + 2] = row[si + 2];
      out[di + 3] = srcBpp === 4 ? row[si + 3] : 255;
    }
  }

  return { data: out, width, height };
}

module.exports = { crc32, pngChunk, fillPixel, encodePngRgba, decodePngRgba };
