// QR Code Model 2 encoder (no external deps).
// Ported from openclaw extensions/qrcode/src/qr-render.ts — CommonJS, no types.
// Implements auto version selection, byte mode, error correction H (30% recovery).

// ─── EC Level H tables (versions 1–10) ─────────────────────────────────────────
// Source: ISO/IEC 18004:2015, Table 9 / thonky.com/qr-code-tutorial

const EC_CODEWORDS_PER_BLOCK = [17, 28, 22, 16, 22, 28, 26, 26, 24, 28];
const DATA_CODEWORDS =         [ 9, 16, 26, 36, 46, 60, 66, 86, 100, 122];
const NUM_BLOCKS =             [ 1,  1,  2,  4,  4,  4,  5,  6,   8,   8];

function chooseVersion(dataLen) {
  for (let v = 1; v <= 10; v++) {
    const cciBits = v <= 9 ? 8 : 16;
    const totalDataBits = DATA_CODEWORDS[v - 1] * 8;
    const availableBits = totalDataBits - 4 - cciBits;
    if (dataLen * 8 <= availableBits) return v;
  }
  return 10;
}

function getModuleCount(version) {
  return 17 + version * 4;
}

// ─── Galois Field GF(256) arithmetic ────────────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polyMul(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return result;
}

function generateECPoly(numEC) {
  let poly = [1];
  for (let i = 0; i < numEC; i++) {
    poly = polyMul(poly, [1, GF_EXP[i]]);
  }
  return poly;
}

function computeEC(data, numEC) {
  const gen = generateECPoly(numEC);
  const msg = [...data, ...new Array(numEC).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      msg[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return msg.slice(data.length);
}

// ─── Data encoding (byte mode) ─────────────────────────────────────────────────

function encodeData(input, version) {
  const totalCodewords = DATA_CODEWORDS[version - 1];
  const cciBits = version <= 9 ? 8 : 16;
  const bytes = Buffer.from(input, 'utf8');

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // byte mode indicator
  pushBits(bytes.length, cciBits);
  for (const b of bytes) pushBits(b, 8);

  const maxBits = totalCodewords * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    codewords.push(byte);
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (codewords.length < totalCodewords) {
    codewords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  return codewords;
}

function interleaveBlocks(version, dataCodewords) {
  const numBlocks = NUM_BLOCKS[version - 1];
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[version - 1];
  const totalData = DATA_CODEWORDS[version - 1];
  const baseBlockSize = Math.floor(totalData / numBlocks);
  const largerBlocks = totalData % numBlocks;

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (let i = 0; i < numBlocks; i++) {
    const blockSize = baseBlockSize + (i >= numBlocks - largerBlocks ? 1 : 0);
    const block = dataCodewords.slice(offset, offset + blockSize);
    dataBlocks.push(block);
    ecBlocks.push(computeEC(block, ecPerBlock));
    offset += blockSize;
  }

  const result = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }

  return result;
}

// ─── QR matrix placement ────────────────────────────────────────────────────────

function createMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function placeFinderPattern(matrix, row, col) {
  const pattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr >= 0 && mr < matrix.length && mc >= 0 && mc < matrix.length) {
        matrix[mr][mc] = pattern[r][c];
      }
    }
  }
}

function placeSeparators(matrix) {
  const n = matrix.length;
  for (let i = 0; i < 8; i++) {
    if (i < n) {
      if (7 < n) matrix[i][7] = 0;
      if (7 < n) matrix[7][i] = 0;
    }
    if (n - 8 >= 0 && i < n) {
      matrix[i][n - 8] = 0;
      if (7 < n) matrix[7][n - 8 + i < n ? n - 8 + i : n - 1] = 0;
    }
    if (n - 8 >= 0 && i < n) {
      matrix[n - 8][i] = 0;
      if (n - 8 + i < n) matrix[n - 8 + i][7] = 0;
    }
  }
}

function placeTimingPatterns(matrix) {
  const n = matrix.length;
  for (let i = 8; i < n - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0 ? 1 : 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }
}

function placeDarkModule(matrix, version) {
  matrix[4 * version + 9][8] = 1;
}

function reserveFormatInfo(matrix) {
  const n = matrix.length;
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = 0;
    if (matrix[i][8] === null) matrix[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][n - 1 - i] === null) matrix[8][n - 1 - i] = 0;
  }
  for (let i = 0; i < 7; i++) {
    if (matrix[n - 1 - i][8] === null) matrix[n - 1 - i][8] = 0;
  }
}

const ALIGNMENT_POSITIONS = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function placeAlignmentPatterns(matrix, version) {
  if (version < 2) return;
  const positions = ALIGNMENT_POSITIONS[version - 1];
  for (const row of positions) {
    for (const col of positions) {
      if (matrix[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const val = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0) ? 1 : 0;
          matrix[row + r][col + c] = val;
        }
      }
    }
  }
}

function placeDataBits(matrix, data) {
  const n = matrix.length;
  const bits = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }

  let bitIdx = 0;
  let col = n - 1;
  let upward = true;

  while (col > 0) {
    if (col === 6) col--;
    const rows = upward
      ? Array.from({ length: n }, (_, i) => n - 1 - i)
      : Array.from({ length: n }, (_, i) => i);

    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= n) continue;
        if (matrix[row][c] !== null) continue;
        matrix[row][c] = bitIdx < bits.length ? bits[bitIdx] : 0;
        bitIdx++;
      }
    }
    col -= 2;
    upward = !upward;
  }
}

// ─── Masking ────────────────────────────────────────────────────────────────────

function applyMask(matrix, reserved, maskId) {
  const n = matrix.length;
  const maskFn = (r, c) => {
    switch (maskId) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  };

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (reserved[r][c] !== null) continue;
      if (maskFn(r, c)) {
        matrix[r][c] = matrix[r][c] === 1 ? 0 : 1;
      }
    }
  }
}

// Format strings for EC level H, masks 0–7
const FORMAT_STRINGS = [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b];

function placeFormatInfo(matrix, maskId) {
  const n = matrix.length;
  const info = FORMAT_STRINGS[maskId];
  const bits = [];
  for (let i = 0; i < 15; i++) bits.push((info >> i) & 1);

  const positions1 = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];
  for (let i = 0; i < 15; i++) {
    matrix[positions1[i][0]][positions1[i][1]] = bits[i];
  }

  const positions2 = [
    [8, n - 1], [8, n - 2], [8, n - 3], [8, n - 4], [8, n - 5],
    [8, n - 6], [8, n - 7], [8, n - 8],
    [n - 7, 8], [n - 6, 8], [n - 5, 8], [n - 4, 8],
    [n - 3, 8], [n - 2, 8], [n - 1, 8],
  ];
  for (let i = 0; i < 15; i++) {
    matrix[positions2[i][0]][positions2[i][1]] = bits[i];
  }
}

function penaltyScore(matrix) {
  const n = matrix.length;
  let score = 0;
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c < n; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        run++;
      } else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r < n; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        run++;
      } else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  return score;
}

// ─── Main QR builder ────────────────────────────────────────────────────────────

function buildQrMatrix(input) {
  const version = chooseVersion(Buffer.from(input, 'utf8').length);
  const moduleCount = getModuleCount(version);

  const dataCodewords = encodeData(input, version);
  const interleaved = interleaveBlocks(version, dataCodewords);

  const matrix = createMatrix(moduleCount);

  placeFinderPattern(matrix, 0, 0);
  placeFinderPattern(matrix, 0, moduleCount - 7);
  placeFinderPattern(matrix, moduleCount - 7, 0);
  placeSeparators(matrix);
  placeTimingPatterns(matrix);
  placeAlignmentPatterns(matrix, version);
  placeDarkModule(matrix, version);
  reserveFormatInfo(matrix);

  const reserved = createMatrix(moduleCount);
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      reserved[r][c] = matrix[r][c] !== null ? 1 : null;
    }
  }

  placeDataBits(matrix, interleaved);

  let bestMask = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const copy = matrix.map((row) => [...row]);
    applyMask(copy, reserved, m);
    placeFormatInfo(copy, m);
    const s = penaltyScore(copy);
    if (s < bestScore) {
      bestScore = s;
      bestMask = m;
    }
  }

  applyMask(matrix, reserved, bestMask);
  placeFormatInfo(matrix, bestMask);

  return { matrix, moduleCount };
}

module.exports = { buildQrMatrix, getModuleCount };
