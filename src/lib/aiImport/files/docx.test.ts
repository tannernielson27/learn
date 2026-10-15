import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxToMarkdown } from "./docx";
import {
  NOTICE,
  buildDocx,
  document,
  image,
  numbering,
  para,
  paraWith,
  run,
  table,
  textBox,
} from "./testing/fixtures";

const corpus = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "ai-import", "corpus", name)));

function markdownOf(body: string, extra: Partial<Parameters<typeof buildDocx>[0]> = {}): string {
  const result = docxToMarkdown(buildDocx({ body, ...extra }));
  if (!result.ok) throw new Error(`refused: ${result.code}`);
  return result.markdown;
}

/** The cells of the markdown table row that contains `text`. */
function rowWith(markdown: string, text: string): string[] {
  const line = markdown.split("\n").find((l) => l.startsWith("|") && l.includes(text));
  if (!line) throw new Error(`no row with ${text}`);
  return line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

describe("docxToMarkdown on the corpus", () => {
  const result = docxToMarkdown(corpus("02-cardiac-unit-quiz.docx"));
  const markdown = result.ok ? result.markdown : "";

  it("converts the whole document, notice included", () => {
    expect(result.ok).toBe(true);
    expect(markdown).toContain(NOTICE.replace("#341", "#339"));
    expect(markdown).toContain("**Cardiac Step-Down Unit Quiz**");
  });

  it("keeps Word highlighting as ==…== with its colour, and plain underline outside it", () => {
    for (const phrase of [
      "needed three pillows to sleep last night",
      "up 2.1 kg since yesterday",
      "Fine crackles in both lung bases",
    ]) {
      expect(markdown).toContain(`==<u>${phrase}</u>=={yellow}`);
    }
    expect(markdown).toContain("<u>alert and oriented</u>");
    expect(markdown).not.toMatch(/==[^=\n]*alert and oriented/);
  });

  it("keeps each * of a matrix in its own column", () => {
    expect(rowWith(markdown, "Assessment finding")).toEqual([
      "Assessment finding",
      "Expected",
      "Unexpected",
    ]);
    expect(rowWith(markdown, "Right pedal pulse 2+")).toEqual(["Right pedal pulse 2+", "*", ""]);
    expect(rowWith(markdown, "Right foot cool and pale")).toEqual([
      "Right foot cool and pale",
      "",
      "*",
    ]);
    expect(rowWith(markdown, "Metoprolol tartrate")).toEqual(["Metoprolol tartrate", "✓", "", "✓"]);
  });

  it("keeps a cell's paragraphs apart, with the * on its choice", () => {
    const [, actions] = rowWith(markdown, "Digoxin 0.125 mg");
    expect(actions.split("<br>")).toEqual([
      "Hold if the apical pulse is below 60/min *",
      "Give with an antacid",
      "Give a double dose if one is missed",
    ]);
  });

  it("reports no images and the length of the text alone", () => {
    expect(result.ok && result.images).toBe(0);
    expect(result.ok && result.textChars).toBeGreaterThan(1000);
    expect(result.ok && result.textChars).toBeLessThan(markdown.length);
  });
});

describe("docxToMarkdown formatting", () => {
  it("marks bold, italic and underline, with spaces outside the markers", () => {
    const md = markdownOf(
      para(
        run("Give "),
        run("all ", { bold: true }),
        run("doses", { italic: true }),
        run(" on time", { underline: true }),
      ),
    );
    expect(md).toBe("Give **all** *doses* <u>on time</u>");
  });

  it("joins runs with the same formatting, and keeps one highlight across bold and plain", () => {
    const md = markdownOf(
      para(
        run("Key: "),
        run("crackles", { highlight: "green", bold: true }),
        run(" in both bases", { highlight: "green" }),
      ),
    );
    expect(md).toBe("Key: ==**crackles** in both bases=={green}");
  });

  it("treats run shading as a highlight, by its fill colour", () => {
    const md = markdownOf(para(run("shaded key", { shading: "FFFF00" }), run(" plain")));
    expect(md).toBe("==shaded key=={#FFFF00} plain");
    expect(markdownOf(para(run("white", { shading: "FFFFFF" })))).toBe("white");
  });

  it("ignores formatting switched off", () => {
    const off =
      '<w:r><w:rPr><w:b w:val="0"/><w:u w:val="none"/><w:highlight w:val="none"/></w:rPr><w:t>plain</w:t></w:r>';
    expect(markdownOf(para(off))).toBe("plain");
  });

  it("writes line breaks, tabs and symbols", () => {
    const body = para(
      '<w:r><w:t>one</w:t><w:br/><w:t>two</w:t><w:tab/><w:t>three</w:t><w:noBreakHyphen/><w:sym w:font="Wingdings" w:char="F0FC"/></w:r>',
    );
    expect(markdownOf(body)).toBe("one\ntwo\tthree-✓");
  });
});

describe("docxToMarkdown structure", () => {
  it("writes headings from the style's name", () => {
    const styles =
      '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:style w:type="paragraph" w:styleId="Kop2"><w:name w:val="heading 2"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style></w:styles>';
    const md = markdownOf(
      paraWith('<w:pStyle w:val="Title"/>', "Unit 4") +
        paraWith('<w:pStyle w:val="Kop2"/>', "Question 1") +
        paraWith('<w:pStyle w:val="Heading3"/>', "Part A"),
      { styles },
    );
    expect(md).toBe("# Unit 4\n\n## Question 1\n\n### Part A");
  });

  it("numbers lists as Word shows them, nested levels included", () => {
    const abstract =
      '<w:abstractNum w:abstractNumId="0">' +
      '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>' +
      '<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl>' +
      "</w:abstractNum>" +
      '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="\uF0B7"/></w:lvl></w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>';
    const nums =
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
      '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
      '<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>';
    const item = (numId: number, ilvl: number, text: string) =>
      paraWith(`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`, text);
    const md = markdownOf(
      item(1, 0, "Assess") +
        item(1, 1, "airway") +
        item(1, 1, "breathing") +
        item(1, 0, "Report") +
        item(1, 1, "to the provider") +
        item(2, 0, "a bullet") +
        item(3, 0, "roman"),
      { numbering: numbering(abstract, nums) },
    );
    expect(md).toBe(
      "1. Assess\n  a) airway\n  b) breathing\n2. Report\n  a) to the provider\n- a bullet\nIII. roman",
    );
  });

  it("keeps cell shading and merged columns", () => {
    const md = markdownOf(
      table([
        [{ text: "Finding", span: 2 }, "Key"],
        ["Pulse", "88", { text: "Yes", fill: "D9D9D9" }],
        ["a | b", "", { text: "No", fill: "auto" }],
      ]),
    );
    expect(md.split("\n")).toEqual([
      "| Finding |  | Key |",
      "| --- | --- | --- |",
      "| Pulse | 88 | {shaded #D9D9D9} Yes |",
      "| a \\| b |  | No |",
    ]);
  });

  it("keeps a text box's text once, after its paragraph", () => {
    const md = markdownOf(para(run("Before the box. "), textBox("Vital signs: BP 132/84")));
    expect(md).toBe("Before the box.\n\n[text box]\nVital signs: BP 132/84\n[/text box]");
  });

  it("replaces each image with [image] and counts them", () => {
    const result = docxToMarkdown(
      buildDocx({ body: para(run("See the X-ray "), image()) + para(image()) }),
    );
    expect(result).toMatchObject({
      ok: true,
      markdown: "See the X-ray [image]\n\n[image]",
      images: 2,
    });
  });
});

describe("docxToMarkdown tracked changes, comments and fields", () => {
  it("shows the final view: insertions kept, deletions and moved-from text gone", () => {
    const body = para(
      run("The client takes "),
      '<w:del w:id="1" w:author="Fictional Reviewer"><w:r><w:delText>two</w:delText></w:r></w:del>',
      '<w:ins w:id="2" w:author="Fictional Reviewer"><w:r><w:t>three</w:t></w:r></w:ins>',
      run(" tablets."),
      '<w:moveFrom w:id="3"><w:r><w:t>Old place.</w:t></w:r></w:moveFrom>',
    );
    expect(markdownOf(body)).toBe("The client takes three tablets.");
  });

  it("drops comments and their marks", () => {
    const body = para(
      '<w:commentRangeStart w:id="0"/>',
      run("Correct order: 2, 1, 3"),
      '<w:commentRangeEnd w:id="0"/>',
      '<w:r><w:commentReference w:id="0"/></w:r>',
    );
    const comments =
      '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0"><w:p><w:r><w:t>Reviewer: check this key</w:t></w:r></w:p></w:comment></w:comments>';
    expect(markdownOf(body, { extra: { "word/comments.xml": comments } })).toBe(
      "Correct order: 2, 1, 3",
    );
  });

  it("keeps a field's result, not its instruction", () => {
    const body = para(
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>4</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>',
      '<w:hyperlink r:id="rId5"><w:r><w:t> link text</w:t></w:r></w:hyperlink>',
      "<w:sdt><w:sdtContent><w:r><w:t> in a control</w:t></w:r></w:sdtContent></w:sdt>",
    );
    expect(markdownOf(body)).toBe("4 link text in a control");
  });

  it("drops a deleted table row", () => {
    const md = markdownOf(
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Head</w:t></w:r></w:p></w:tc></w:tr>" +
        '<w:tr><w:trPr><w:del w:id="9"/></w:trPr><w:tc><w:p><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p></w:tc></w:tr>' +
        "<w:tr><w:tc><w:p><w:r><w:t>kept</w:t></w:r></w:p></w:tc></w:tr></w:tbl>",
    );
    expect(md).toBe("| Head |\n| --- |\n| kept |");
  });
});

describe("docxToMarkdown refusals", () => {
  it("refuses a document with a DOCTYPE, which Word never writes", () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY a "aaaa">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&a;</w:t></w:r></w:p></w:body></w:document>';
    expect(docxToMarkdown(buildDocx({ body: "", documentXml: xml }))).toMatchObject({
      ok: false,
      code: "corrupt",
    });
  });

  it("refuses XML that does not parse, and a package with no main document", () => {
    expect(
      docxToMarkdown(buildDocx({ body: "", documentXml: "<w:document><w:body><w:p>" })),
    ).toMatchObject({ ok: false, code: "corrupt" });
    expect(docxToMarkdown(zipSync({ "word/other.xml": new Uint8Array(4) }))).toMatchObject({
      ok: false,
      code: "corrupt",
    });
    expect(docxToMarkdown(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false, code: "corrupt" });
  });

  it("refuses a zip bomb before inflating it", () => {
    const bomb = zipSync({ "word/document.xml": new Uint8Array(30 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(100_000);
    expect(docxToMarkdown(bomb)).toMatchObject({ ok: false, code: "too_complex" });
  });

  it("refuses a part that lies about its size, instead of trusting it", () => {
    const honest = zipSync({
      "word/document.xml": new TextEncoder().encode(document(para("x".repeat(5000)))),
    });
    const lying = Buffer.from(honest);
    const central = lying.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    lying.writeUInt32LE(100, central + 24);
    lying.writeUInt32LE(100, 22);
    expect(docxToMarkdown(new Uint8Array(lying))).toMatchObject({ ok: false, code: "corrupt" });
  });

  it("refuses more elements than a quiz has, before parsing them", () => {
    const runs = "<w:r/>".repeat(300_000);
    expect(docxToMarkdown(buildDocx({ body: para(runs) }))).toMatchObject({
      ok: false,
      code: "too_complex",
    });
  });

  it("refuses nesting deeper than Word writes", () => {
    const deep =
      "<w:sdt><w:sdtContent>".repeat(300) + para("x") + "</w:sdtContent></w:sdt>".repeat(300);
    expect(docxToMarkdown(buildDocx({ body: deep }))).toMatchObject({
      ok: false,
      code: "too_complex",
    });
  });
});
