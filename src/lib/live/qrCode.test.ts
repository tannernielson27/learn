import { describe, expect, it } from "vitest";
import { encodeQr, QR_MASK_COUNT, QR_QUIET_ZONE, qrSvgPath, qrViewBoxSize } from "./qrCode";

/**
 * Matrices produced by an independent implementation — kazuhikoarase's `qrcode-generator`, at
 * error-correction level M with its UTF-8 byte encoder — run once outside this repo and pasted in.
 * Nothing here calls it; these are its answers, and `src/lib/live/qrCode.ts` has to reproduce
 * them. That is the point: a round trip through our own encoder and decoder would agree with
 * itself however wrong it was.
 *
 * Reproduce with:
 *   npm i qrcode-generator
 *   node -e "const q=require('qrcode-generator');q.stringToBytes=q.stringToBytesFuncs['UTF-8'];
 *     const c=q(0,'M');c.addData(TEXT,'Byte');c.make();const n=c.getModuleCount();const b=[];
 *     for(let r=0;r<n;r++)for(let x=0;x<n;x++)b.push(c.isDark(r,x)?1:0);
 *     const u=Buffer.alloc(Math.ceil(b.length/8));b.forEach((v,i)=>{if(v)u[i>>3]|=1<<(7-(i&7))});
 *     console.log(n,u.toString('base64'))"
 *
 * The seven cover every branch the encoder has: versions 1 to 8, so both the eight-bit character
 * count and the version information block (version 7 and up) and both the one-group and two-group
 * block layouts (version 8 is 2x38 plus 2x39); a multi-byte string, so the UTF-8 encoding is not
 * taken on trust; and a one-character string, so the padding run is the longest it can be.
 */
const REFERENCE: readonly { text: string; size: number; matrix: string }[] = [
  {
    text: "A",
    size: 21,
    matrix: "/tP8ExBunrt1xduursF5B/qv4BcAi5fJRMr9jPnCjW7444BXH/swUE8quvP90sruhPkEjU/q4oA=",
  },
  {
    text: "áé—ñ ünïcodé",
    size: 25,
    matrix:
      "/p+/wRpQbpMLt15V26x67BRVB/qq/gFNAIuqfPbRzFnWVDO0SIAjdC1hWZCfeW4RaUHnTPqAQ0R/qGswTVGrqX+d0kTO6Hj9BCpK/q0tgA==",
  },
  {
    text: "https://learn.example/join/7KQ2MZ",
    size: 29,
    matrix:
      "/r8j/BFKUG6hGLt0s+XbopquwXN1B/qqr+AHhQCjbZkoZQbY5Ym+W0uHVIslaODSjy2MiKZiL5igQHNUMwolRtn/hcSyAqVaDXvq/QBrVHf7hiowRacSukVf3dOKp26lzicEnFSP7nTkgA==",
  },
  {
    text: "https://learn-git-feat-129-join-session-tannernielson27.vercel.app/join/ABCDEF",
    size: 37,
    matrix:
      "/jKjU/wTqxyQbpSSiLt0IGFl26cIfa7BalhdB/qqqq/gAo7gAJa0Re0DSZrCcH7vPDEWwfpc0wO+bGblymo9A57vejUGrJf7/1NziC8ecARcjVbvp/ojpvsA6kNl9nBfqVA8QCOuLTNjEHSQ+NlB5g0cWlNNHFRY5aeb2cKzIuqQPjXl4PsAdgDcZ/hakGtwVUzhHLp598/d1Q3Gz66eVbF3BG1Pkg/pvdyBgA==",
  },
  {
    text: "https://learn-git-feat-129-join-session-tannernielson27-team.vercel.app/join/7KQ2MZ?from=qr",
    size: 41,
    matrix:
      "/peOKj/BSWgA0G6+u0Qrt0XiYoXbqV9mkuwRkyklB/qqqqr+ADQglQCfjWitS76CjZ2MU+JoRIKAKslisYRxaAgDGO8Z4RdsOI1ux54rMRZQrK91StFBEF47SuYp3z595i8UIJkJ5bWaTcplxjyYyuJZ6p9RGYkI0GnKJxU4ibNcQmb/XcvN9Db7d7UwQyP3qOC1GVcJbXw8e9kYpa0n828FtEX6UYAs/gBeaalGP7zBduvQVpQ70burjP3/ldc5GdSq6Tp7S3sEMNIgVf7+0kmsAA==",
  },
  {
    text: "https://learn-git-feat-129-join-session-tannernielson27-team-long.vercel.app/join/7KQ2MZ?from=qr&x=1234567",
    size: 41,
    matrix:
      "/qa5z7/BUnGBUG6Pijzrt13/L7Xbo+8tkuwTYKcdB/qqqqr+AcTDGwC3TMw/Jb4mSoH969RBYACPi2daXgZrBbbcboUY4Y+NWG9RnLrCAVlya2fKrluIUC3B+Ggy2bEFK5GfGXOKbbodY+9xADD5Df9oXg0YNZi4M+fYE69j5AfAHZ4c03zd/RJpaKhxhD+GbHJ8NckBJh6tml9XM3P8Yaj1eH16knw+/wBK34FH/6jremuQVMZqMTukkg1P/dbYl+x26h5pAk8EP45Rmv69ltvjAA==",
  },
  {
    text: "https://learn-git-feat-129-join-session-tannernielson27-team.vercel.app/join/7KQ2MZ?from=qr&trace=0123456789abcdef0123456789abcdef",
    size: 49,
    matrix:
      "/oRy7vS/wWTbk83Qbqdt+bFrt0LjUV2l26lu/3lC7BPNserRB/qqqqqq/gDrfFoqAJ+le+5JS8wCDPnT3iCX/mUoBvCCysg+CGj0C9qsxIcjPzWWmYidjXGUfE6A2WrZh4VOlYTtb9sQ7XlAZtcJszZhm1HkIkmDqviTMW3P55cPKGnSmf+j/zffw/fm8cE0QekeaqOWrIqoLETVF0nGO/ba/xW+aJv9ZEy95vW73XzTQc+3A/tmG65ZpMIT8zuCsqUPkF+DHz8/SL6X3F3Xp46+TQyiH2kZOBbYKOi3HVOq2w5Nx15W22EeLWF1X57izEqsip/jrbPli/8AS0sdMsS/u5CrJiowXItHYDG7rqU/5I+l1NCBExiW6EKTx5VtBFSxEKLH/opzJEiYgA==",
  },
];

/** Row strings, so a failure prints two pictures rather than two thousand booleans. */
function draw(modules: readonly (readonly boolean[])[]): string[] {
  return modules.map((row) => row.map((dark) => (dark ? "#" : ".")).join(""));
}

function drawReference(base64: string, size: number): string[] {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const rows: string[] = [];
  for (let row = 0; row < size; row += 1) {
    let line = "";
    for (let column = 0; column < size; column += 1) {
      const bit = row * size + column;
      line += (bytes[bit >> 3] >> (7 - (bit & 7))) & 1 ? "#" : ".";
    }
    rows.push(line);
  }
  return rows;
}

describe("encodeQr against an independent implementation", () => {
  it.each(REFERENCE)("reproduces the reference matrix for $size modules", (reference) => {
    const expected = drawReference(reference.matrix, reference.size);

    // The mask is chosen by a readability score, not by the standard, so the two implementations
    // may land on different ones. What has to agree is everything else: for exactly one mask this
    // encoder must produce the reference module for module.
    const matches: number[] = [];
    for (let mask = 0; mask < QR_MASK_COUNT; mask += 1) {
      const encoded = encodeQr(reference.text, { mask });
      expect(encoded?.size).toBe(reference.size);
      if (draw(encoded!.modules).join("\n") === expected.join("\n")) matches.push(mask);
    }

    expect(matches).toHaveLength(1);
  });

  it("chooses a mask it can reproduce, and draws the same picture twice", () => {
    for (const reference of REFERENCE) {
      const chosen = encodeQr(reference.text);
      expect(chosen).not.toBeNull();
      expect(draw(chosen!.modules)).toEqual(
        draw(encodeQr(reference.text, { mask: chosen!.mask })!.modules),
      );
      expect(chosen!.mask).toBeGreaterThanOrEqual(0);
      expect(chosen!.mask).toBeLessThan(QR_MASK_COUNT);
    }
  });
});

describe("encodeQr", () => {
  it("picks the smallest version that holds the text", () => {
    // Version 1 holds 14 bytes at level M, version 2 holds 26.
    expect(encodeQr("x".repeat(14))?.version).toBe(1);
    expect(encodeQr("x".repeat(15))?.version).toBe(2);
    expect(encodeQr("x".repeat(26))?.version).toBe(2);
    expect(encodeQr("x".repeat(27))?.version).toBe(3);
  });

  it("counts UTF-8 bytes, not characters, when choosing a version", () => {
    // Seven three-byte characters is 21 bytes: past version 1's fourteen.
    expect(encodeQr("—".repeat(7))?.version).toBe(2);
    expect(encodeQr("x".repeat(21))?.version).toBe(2);
  });

  it("returns null rather than throwing when the text cannot fit", () => {
    // Version 9, the largest this encoder builds, holds 180 bytes at level M.
    expect(encodeQr("x".repeat(180))?.version).toBe(9);
    expect(encodeQr("x".repeat(181))).toBeNull();
  });

  it("encodes the empty string", () => {
    const encoded = encodeQr("");
    expect(encoded?.version).toBe(1);
    expect(encoded?.size).toBe(21);
  });

  it("draws the three finder patterns and the always-dark module", () => {
    const { size, modules } = encodeQr("https://learn.example/join/7KQ2MZ")!;
    for (const [top, left] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      expect(modules[top][left]).toBe(true);
      expect(modules[top + 1][left + 1]).toBe(false);
      expect(modules[top + 3][left + 3]).toBe(true);
    }
    expect(modules[size - 8][8]).toBe(true);
  });

  it("draws the timing patterns as alternating modules", () => {
    const { size, modules } = encodeQr("https://learn.example/join/7KQ2MZ")!;
    for (let i = 8; i < size - 8; i += 1) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }
  });
});

describe("qrSvgPath", () => {
  it("draws one unit square per dark module, offset by the quiet zone", () => {
    const matrix = encodeQr("A")!;
    const path = qrSvgPath(matrix);
    const squares = path.match(/M/g) ?? [];
    const dark = matrix.modules.flat().filter(Boolean).length;
    expect(squares).toHaveLength(dark);
    // The top-left module of a finder pattern is always dark and always at the origin.
    expect(path.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1z`)).toBe(true);
  });

  it("leaves room for the quiet zone on both sides", () => {
    const matrix = encodeQr("A")!;
    expect(qrViewBoxSize(matrix)).toBe(matrix.size + QR_QUIET_ZONE * 2);
    expect(qrViewBoxSize(matrix, 0)).toBe(matrix.size);
    expect(qrSvgPath(matrix, 0).startsWith("M0 0h1v1h-1z")).toBe(true);
  });
});
