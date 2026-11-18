import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkSpans, chunkText, decodeText, estimatePages, joinTextParts } from "./text";
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

// #592: the chunks were joined again with nothing, so words and table rows ran together.
describe("chunkSpans and joinTextParts", () => {
  /** The chunks of `text` with what was cut before each, as `prepareFile` builds them. */
  function parts(text: string, target: number, max: number) {
    const spans = chunkSpans(text, target, max);
    return spans.map((span, position) => ({
      position,
      text: text.slice(span.start, span.end),
      gapBefore: position === 0 ? "" : text.slice(spans[position - 1].end, span.start),
    }));
  }

  it("gives the same chunks as chunkText, as places in the text", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Block ${i} ${"w".repeat(200)}`).join("\n\n");
    expect(parts(text, 1000, 2000).map((part) => part.text)).toEqual(chunkText(text, 1000, 2000));
  });

  it("joins chunks cut at blank lines of any size back into the text", () => {
    const text = ` \n${Array.from({ length: 40 }, (_, i) => `Question ${i}\nA. One\nB. Two`).join("\n \n\n\n")}\n\n`;
    const cut = parts(text, 120, 400);
    expect(cut.length).toBeGreaterThan(5);
    expect(joinTextParts(cut)).toBe(text.trim());
  });

  it("keeps the rows of a long table on their own lines", () => {
    const table = Array.from({ length: 60 }, (_, i) => `| row ${i} | ${"v".repeat(40)} |`).join(
      "\n",
    );
    const cut = parts(table, 500, 1000);
    expect(cut.length).toBeGreaterThan(2);
    expect(cut.map((part) => part.text).join("")).toContain("||");
    expect(joinTextParts(cut)).toBe(table);
  });

  it("joins a line cut in the middle with nothing, and a heading with its blank line", () => {
    const solid = "y".repeat(5000);
    expect(joinTextParts(parts(solid, 1000, 2000))).toBe(solid);
    const mixed = `# Title\n\n${"p".repeat(900)}\n\n${"q".repeat(2500)}\n${"r".repeat(300)}\n\n## Next\n\nlast`;
    expect(joinTextParts(parts(mixed, 1000, 2000))).toBe(mixed);
  });

  it("puts a blank line between chunks that are not neighbours, or have no recorded gap", () => {
    expect(
      joinTextParts([
        { position: 0, text: "first" },
        { position: 2, text: "third", gapBefore: "\n" },
        { position: 5, text: "sixth" },
        { position: 6, text: " seventh" },
      ]),
    ).toBe("first\nthird\n\nsixth seventh");
  });
});
