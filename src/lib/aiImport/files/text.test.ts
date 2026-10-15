import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkText, decodeText, estimatePages } from "./text";
import { utf8 } from "./testing/fixtures";

describe("decodeText", () => {
  it("drops a BOM and turns Windows and old Mac line ends into \\n", () => {
    expect(decodeText(utf8("\uFEFF# Quiz\r\nOne\rTwo"))).toBe("# Quiz\nOne\nTwo");
  });

  it("refuses bytes that are not UTF-8", () => {
    expect(() => decodeText(Uint8Array.from([0xc3, 0x28]))).toThrow();
  });
});

describe("estimatePages", () => {
  it("counts about 3,000 characters a page, and at least one", () => {
    expect(estimatePages(0)).toBe(1);
    expect(estimatePages(3000)).toBe(1);
    expect(estimatePages(3001)).toBe(2);
    expect(estimatePages(300_000)).toBe(100);
  });
});

describe("chunkText", () => {
  const question = (n: number, length = 900): string =>
    `## Question ${n}\n\n${"The nurse assesses a fictional client. ".repeat(length / 40).trim()}`;

  it("keeps a short document in one chunk, as it is", () => {
    const md = readFileSync(
      join(process.cwd(), "test", "ai-import", "corpus", "01-med-surg-review.md"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(chunkText(md)).toEqual([md.trim()]);
  });

  it("ends each chunk at a heading or a blank line, under the target", () => {
    const text = Array.from({ length: 60 }, (_, i) => question(i + 1)).join("\n\n");
    const chunks = chunkText(text, 5000, 8000);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(5000);
      expect(chunk.startsWith("## Question")).toBe(true);
    }
    // Nothing is lost or repeated: the chunks put back together are the text.
    expect(chunks.join("\n\n") === text).toBe(true);
  });

  it("prefers a heading to a blank line once the chunk is half full", () => {
    const text = [
      "## A",
      "a".repeat(600),
      "b".repeat(600),
      "## B",
      "c".repeat(300),
      "d".repeat(300),
    ].join("\n\n");
    const chunks = chunkText(text, 1500, 3000);
    expect(chunks[1]?.startsWith("## B")).toBe(true);
  });

  it("cuts one block longer than the maximum at its lines, then anywhere", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(90)}`).join("\n");
    const lineChunks = chunkText(lines, 1000, 2000);
    expect(lineChunks.every((chunk) => chunk.length <= 2000)).toBe(true);
    expect(lineChunks.join("\n")).toBe(lines);

    const solid = "y".repeat(5000);
    const solidChunks = chunkText(solid, 1000, 2000);
    expect(solidChunks.every((chunk) => chunk.length <= 2000)).toBe(true);
    expect(solidChunks.join("")).toBe(solid);
  });

  it("returns no chunks for blank text", () => {
    expect(chunkText(" \n\n \n")).toEqual([]);
  });
});
