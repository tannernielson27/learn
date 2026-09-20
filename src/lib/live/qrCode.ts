/**
 * A QR code for the join URL, drawn by hand rather than by a dependency.
 *
 * Why no library: the host console needs one picture of one short URL. The whole of QR that a
 * URL needs is byte mode at one error-correction level, and that is what is here — under four
 * hundred lines of code, most of it tables and comments, against a new runtime dependency in
 * every deploy and every audit from now on. What is deliberately NOT here:
 * numeric and alphanumeric modes, kanji, structured append, and error-correction levels other
 * than M. A join URL is bytes and fits in a small version, so none of them would ever run.
 *
 * Correctness is not taken on trust. `qrCode.test.ts` holds matrices produced by an independent
 * implementation (kazuhikoarase's `qrcode-generator`, run once outside this repo) and asserts
 * this encoder reproduces them module for module. Mask *selection* is a readability heuristic
 * rather than part of the code's meaning, so the fixtures are matched against a forced mask and
 * the chosen mask is checked separately against the published penalty rules.
 *
 * Pure: no React, no Next, no Supabase, and no Node built-ins — it runs anywhere.
 *
 * Reference: ISO/IEC 18004. Error correction level M (about 15% recovery), which is the usual
 * choice for a code read off a screen: L is thinner than a projector's contrast deserves and Q
 * would push the version, and therefore the module count, up for no gain.
 */

/** A square grid of modules. `true` is a dark module. */
export interface QrMatrix {
  /** Modules per side, not counting the quiet zone. */
  readonly size: number;
  /** Row-major, `size` rows of `size` booleans. */
  readonly modules: readonly (readonly boolean[])[];
  /** The version, 1 to 9. */
  readonly version: number;
  /** The mask pattern applied, 0 to 7. */
  readonly mask: number;
}

/**
 * Per version (1 to 9): error-correction codewords per block, then each group's block count and
 * data codewords per block. Level M only. Versions above 9 are left out on purpose — their byte
 * mode uses a sixteen-bit character count, and version 9 already holds 180 bytes, far more than
 * any join URL. Taken from ISO/IEC 18004 tables 13 to 22.
 */
const VERSIONS: readonly (readonly [number, number, number, number, number])[] = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
];

/** Alignment-pattern centre coordinates per version, indexed from version 1 (which has none). */
const ALIGNMENT_CENTRES: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
];

/** Level M is `00` in the five-bit format information. */
const EC_LEVEL_M = 0b00;

/** Byte mode, and the eight-bit character count that goes with versions 1 to 9. */
const BYTE_MODE = 0b0100;
const COUNT_BITS = 8;

/** The two padding codewords the standard names, used in turn once the data runs out. */
const PAD_CODEWORDS = [0b11101100, 0b00010001] as const;

export const QR_MASK_COUNT = 8;

// ---------------------------------------------------------------------------
// GF(256), the field Reed-Solomon works in
// ---------------------------------------------------------------------------

// Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1, as the standard specifies.
const PRIMITIVE = 0x11d;
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= PRIMITIVE;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial of the given degree, highest coefficient first. */
function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMultiply(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The error-correction codewords for one block: the remainder of a polynomial division. */
function errorCorrectionFor(block: readonly number[], count: number): number[] {
  const generator = generatorPolynomial(count);
  const remainder = new Array<number>(count).fill(0);
  for (const codeword of block) {
    const factor = codeword ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor === 0) continue;
    for (let i = 0; i < count; i += 1) remainder[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return remainder;
}

// ---------------------------------------------------------------------------
// Data codewords
// ---------------------------------------------------------------------------

/** How many bytes a version holds in byte mode at level M, after the mode and count header. */
function byteCapacity(version: number): number {
  const [, group1Blocks, group1Data, group2Blocks, group2Data] = VERSIONS[version - 1];
  const dataCodewords = group1Blocks * group1Data + group2Blocks * group2Data;
  return Math.floor((dataCodewords * 8 - 4 - COUNT_BITS) / 8);
}

/** The smallest version that holds this many bytes, or null when none of 1 to 9 does. */
function versionFor(byteLength: number): number | null {
  for (let version = 1; version <= VERSIONS.length; version += 1) {
    if (byteLength <= byteCapacity(version)) return version;
  }
  return null;
}

/** The data codewords for a version: header, payload, terminator and padding. */
function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const [, group1Blocks, group1Data, group2Blocks, group2Data] = VERSIONS[version - 1];
  const total = group1Blocks * group1Data + group2Blocks * group2Data;

  const bits: number[] = [];
  const put = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  put(BYTE_MODE, 4);
  put(bytes.length, COUNT_BITS);
  for (const byte of bytes) put(byte, 8);

  // Up to four zero bits say the message is over; a shorter run is allowed when the capacity ends
  // first, which is why this is a loop and not a fixed four.
  for (let i = 0; i < 4 && bits.length < total * 8; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let codeword = 0;
    for (let bit = 0; bit < 8; bit += 1) codeword = (codeword << 1) | bits[i + bit];
    codewords.push(codeword);
  }
  // The padding always begins with the first of the two, whatever the message length left behind.
  for (let pad = 0; codewords.length < total; pad += 1) codewords.push(PAD_CODEWORDS[pad % 2]);
  return codewords;
}

/** Splits the data into blocks, adds each block's error correction, and interleaves the lot. */
function interleave(codewords: readonly number[], version: number): number[] {
  const [ecCount, group1Blocks, group1Data, group2Blocks, group2Data] = VERSIONS[version - 1];

  const blocks: number[][] = [];
  let taken = 0;
  for (const [count, size] of [
    [group1Blocks, group1Data],
    [group2Blocks, group2Data],
  ] as const) {
    for (let i = 0; i < count; i += 1) {
      blocks.push(codewords.slice(taken, taken + size));
      taken += size;
    }
  }

  const corrections = blocks.map((block) => errorCorrectionFor(block, ecCount));
  const longestBlock = Math.max(...blocks.map((block) => block.length));

  const out: number[] = [];
  for (let i = 0; i < longestBlock; i += 1) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecCount; i += 1) {
    for (const correction of corrections) out.push(correction[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// BCH codes for the format and version information
// ---------------------------------------------------------------------------

function bitLength(value: number): number {
  let length = 0;
  for (let rest = value; rest !== 0; rest >>>= 1) length += 1;
  return length;
}

const FORMAT_GENERATOR = 0b101_0011_0111;
const FORMAT_MASK = 0b101_0100_0001_0010;
const VERSION_GENERATOR = 0b1_1111_0010_0101;

/** The fifteen bits that say "level M, mask n", error-corrected and masked. */
function formatInformation(mask: number): number {
  const data = (EC_LEVEL_M << 3) | mask;
  let remainder = data << 10;
  while (bitLength(remainder) - bitLength(FORMAT_GENERATOR) >= 0) {
    remainder ^= FORMAT_GENERATOR << (bitLength(remainder) - bitLength(FORMAT_GENERATOR));
  }
  return ((data << 10) | remainder) ^ FORMAT_MASK;
}

/** The eighteen bits that name the version. Only versions 7 and up carry them. */
function versionInformation(version: number): number {
  let remainder = version << 12;
  while (bitLength(remainder) - bitLength(VERSION_GENERATOR) >= 0) {
    remainder ^= VERSION_GENERATOR << (bitLength(remainder) - bitLength(VERSION_GENERATOR));
  }
  return (version << 12) | remainder;
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

interface Grid {
  size: number;
  modules: boolean[][];
  /** A module belonging to a function pattern, which carries no data and is never masked. */
  reserved: boolean[][];
}

function blankGrid(version: number): Grid {
  const size = version * 4 + 17;
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function reserve(grid: Grid, top: number, left: number, height: number, width: number): void {
  for (let row = top; row < top + height; row += 1) {
    for (let column = left; column < left + width; column += 1) {
      grid.reserved[row][column] = true;
    }
  }
}

/** A finder pattern's seven-by-seven eye, drawn from its top-left corner. */
function drawFinder(grid: Grid, top: number, left: number): void {
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const ring = Math.max(Math.abs(row - 3), Math.abs(column - 3));
      grid.modules[top + row][left + column] = ring !== 2;
    }
  }
}

/** An alignment pattern's five-by-five eye, drawn from its centre. */
function drawAlignment(grid: Grid, centreRow: number, centreColumn: number): void {
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const ring = Math.max(Math.abs(row), Math.abs(column));
      grid.modules[centreRow + row][centreColumn + column] = ring !== 1;
      grid.reserved[centreRow + row][centreColumn + column] = true;
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const last = grid.size - 1;

  drawFinder(grid, 0, 0);
  drawFinder(grid, 0, grid.size - 7);
  drawFinder(grid, grid.size - 7, 0);
  // Each finder, its white separator and the format information beside it, in one block.
  reserve(grid, 0, 0, 9, 9);
  reserve(grid, 0, grid.size - 8, 9, 8);
  reserve(grid, grid.size - 8, 0, 8, 9);

  // Timing: alternating modules along row six and column six, dark at even coordinates. Drawn
  // only between the separators — the ends of both lines belong to the finder patterns, which
  // are already there — but reserved end to end, because none of row six or column six is data.
  for (let i = 0; i < grid.size; i += 1) {
    grid.reserved[6][i] = true;
    grid.reserved[i][6] = true;
    if (i < 8 || i >= grid.size - 8) continue;
    grid.modules[6][i] = i % 2 === 0;
    grid.modules[i][6] = i % 2 === 0;
  }

  const centres = ALIGNMENT_CENTRES[version - 1];
  for (const row of centres) {
    for (const column of centres) {
      // The three corners are already finders; an alignment pattern never overlaps one.
      const onFinder =
        (row <= 8 && column <= 8) ||
        (row <= 8 && column >= last - 8) ||
        (row >= last - 8 && column <= 8);
      if (!onFinder) drawAlignment(grid, row, column);
    }
  }

  // The one module that is always dark, whatever the mask.
  grid.modules[grid.size - 8][8] = true;

  if (version >= 7) {
    reserve(grid, 0, grid.size - 11, 6, 3);
    reserve(grid, grid.size - 11, 0, 3, 6);
  }
}

/** Lays the interleaved codewords into the grid, two columns at a time from the right. */
function placeData(grid: Grid, codewords: readonly number[]): void {
  let bitIndex = 0;
  let upward = true;
  let right = grid.size - 1;

  while (right > 0) {
    // Column six is the vertical timing pattern. The pair shifts left past it rather than
    // straddling it, and every pair after this one shifts with it.
    if (right === 6) right -= 1;

    for (let step = 0; step < grid.size; step += 1) {
      const row = upward ? grid.size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (grid.reserved[row][column]) continue;
        // Anything past the last codeword is a remainder bit, which the standard leaves light.
        // Asked as a length test rather than an undefined check, because this project does not
        // set `noUncheckedIndexedAccess` and the compiler would read that check as dead.
        const index = bitIndex >> 3;
        grid.modules[row][column] =
          index < codewords.length && ((codewords[index] >> (7 - (bitIndex & 7))) & 1) === 1;
        bitIndex += 1;
      }
    }

    upward = !upward;
    right -= 2;
  }
}

/** The eight mask patterns, by their number in the standard. */
function maskAt(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    default:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
  }
}

function applyMask(grid: Grid, mask: number): void {
  for (let row = 0; row < grid.size; row += 1) {
    for (let column = 0; column < grid.size; column += 1) {
      if (grid.reserved[row][column]) continue;
      if (maskAt(mask, row, column)) grid.modules[row][column] = !grid.modules[row][column];
    }
  }
}

/** Writes the format information twice, as the standard places it. */
function drawFormatInformation(grid: Grid, mask: number): void {
  const bits = formatInformation(mask);
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1;
    // Down the left of the top-left finder, skipping the timing row, then up from the bottom.
    if (i < 6) grid.modules[i][8] = dark;
    else if (i < 8) grid.modules[i + 1][8] = dark;
    else grid.modules[grid.size - 15 + i][8] = dark;

    // And along row eight: from the right edge inwards, then across the top-left corner.
    if (i < 8) grid.modules[8][grid.size - i - 1] = dark;
    else if (i < 9) grid.modules[8][15 - i] = dark;
    else grid.modules[8][14 - i] = dark;
  }
}

function drawVersionInformation(grid: Grid, version: number): void {
  const bits = versionInformation(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >> i) & 1) === 1;
    grid.modules[Math.floor(i / 3)][grid.size - 11 + (i % 3)] = dark;
    grid.modules[grid.size - 11 + (i % 3)][Math.floor(i / 3)] = dark;
  }
}

// ---------------------------------------------------------------------------
// Mask selection
// ---------------------------------------------------------------------------

const FINDER_RUN = [true, false, true, true, true, false, true] as const;

/**
 * The penalty score of ISO/IEC 18004 §8.8.2: long runs of one colour, solid blocks, anything that
 * looks like a finder pattern, and an unbalanced overall darkness. Lowest score wins. This is a
 * readability heuristic, not part of what the code says — every mask decodes to the same text.
 */
function penalty(grid: Grid): number {
  const { size, modules } = grid;
  let score = 0;

  // Runs of five or more in a row or a column.
  for (let i = 0; i < size; i += 1) {
    for (const line of [modules[i], modules.map((row) => row[i])]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        if (line[j] === line[j - 1]) {
          run += 1;
          continue;
        }
        if (run >= 5) score += run - 2;
        run = 1;
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Every two-by-two block of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const first = modules[row][column];
      if (
        modules[row][column + 1] === first &&
        modules[row + 1][column] === first &&
        modules[row + 1][column + 1] === first
      ) {
        score += 3;
      }
    }
  }

  // 1:1:3:1:1 with four light modules on either side, in either direction.
  for (let i = 0; i < size; i += 1) {
    const row = modules[i];
    const column = modules.map((each) => each[i]);
    for (const line of [row, column]) {
      for (let start = 0; start + 7 <= size; start += 1) {
        if (!FINDER_RUN.every((dark, offset) => line[start + offset] === dark)) continue;
        const before = line.slice(Math.max(0, start - 4), start);
        const after = line.slice(start + 7, start + 11);
        if (before.length === 4 && before.every((dark) => !dark)) score += 40;
        if (after.length === 4 && after.every((dark) => !dark)) score += 40;
      }
    }
  }

  // How far the proportion of dark modules strays from half.
  const dark = modules.reduce(
    (total, row) => total + row.reduce((count, module) => count + (module ? 1 : 0), 0),
    0,
  );
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

// ---------------------------------------------------------------------------
// The encoder
// ---------------------------------------------------------------------------

function buildGrid(version: number, codewords: readonly number[], mask: number): Grid {
  const grid = blankGrid(version);
  drawFunctionPatterns(grid, version);
  placeData(grid, codewords);
  applyMask(grid, mask);
  drawFormatInformation(grid, mask);
  if (version >= 7) drawVersionInformation(grid, version);
  return grid;
}

export interface EncodeQrOptions {
  /**
   * Force a mask (0 to 7) instead of choosing the one with the lowest penalty. For tests and for
   * reproducing another implementation's output; nothing in the app passes it.
   */
  mask?: number;
}

/**
 * Encodes text as a QR code at error-correction level M, or returns null when it does not fit in
 * versions 1 to 9 (180 bytes of UTF-8). Null rather than a throw because the caller's answer is
 * always the same — show the code as text and no picture — and a page must not fail to render
 * over a decoration.
 */
export function encodeQr(text: string, options: EncodeQrOptions = {}): QrMatrix | null {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length);
  if (version === null) return null;

  const codewords = interleave(dataCodewords(bytes, version), version);

  if (options.mask !== undefined) {
    const grid = buildGrid(version, codewords, options.mask);
    return { size: grid.size, modules: grid.modules, version, mask: options.mask };
  }

  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < QR_MASK_COUNT; mask += 1) {
    const grid = buildGrid(version, codewords, mask);
    const score = penalty(grid);
    if (score >= bestScore) continue;
    best = grid;
    bestMask = mask;
    bestScore = score;
  }

  // Unreachable: the loop always runs and the first score beats infinity. Narrowing, not a guard.
  if (best === null) return null;
  return { size: best.size, modules: best.modules, version, mask: bestMask };
}

/**
 * The dark modules as one SVG path, in a viewBox of `size + 2 * quietZone` units. One path rather
 * than one rect per module keeps the markup small — a version 3 code is over three hundred dark
 * modules — and renders as a single shape.
 *
 * The quiet zone is four modules, which the standard requires; without it a scanner may not find
 * the code at all against a page background.
 */
export const QR_QUIET_ZONE = 4;

export function qrSvgPath(matrix: QrMatrix, quietZone: number = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (!matrix.modules[row][column]) continue;
      parts.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** The side of the drawing, in module units, including the quiet zone. */
export function qrViewBoxSize(matrix: QrMatrix, quietZone: number = QR_QUIET_ZONE): number {
  return matrix.size + quietZone * 2;
}
