import { describe, expect, it } from "vitest";
import { csvField, neutraliseFormula, toCsv } from "./csv";

describe("neutraliseFormula", () => {
  it.each(["=SUM(A1:A2)", "+1+1", "-2+3", "@SUM(1)", "\tA", "\rA"])(
    "prefixes a single quote to %j so a spreadsheet reads it as text",
    (value) => {
      expect(neutraliseFormula(value)).toBe(`'${value}`);
    },
  );

  it.each(["Ava", "", " =1", "1=1", "O'Neil", "'already quoted"])("leaves %j alone", (value) => {
    expect(neutraliseFormula(value)).toBe(value);
  });
});

describe("csvField", () => {
  it("writes a plain value as it is", () => {
    expect(csvField("Ava")).toBe("Ava");
  });

  it("quotes a value with a comma, a quote, a CR or an LF, doubling quotes (RFC 4180)", () => {
    expect(csvField("Nguyen, Ava")).toBe('"Nguyen, Ava"');
    expect(csvField('Ava "A" Nguyen')).toBe('"Ava ""A"" Nguyen"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("two\r\nlines")).toBe('"two\r\nlines"');
  });

  it("neutralises before quoting, so the quote goes around the prefixed value", () => {
    expect(csvField('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvField("\r=1")).toBe(`"'\r=1"`);
  });

  it("writes numbers as numbers, a negative one included", () => {
    expect(csvField(3)).toBe("3");
    expect(csvField(-1.5)).toBe("-1.5");
    expect(csvField(0)).toBe("0");
  });

  it("writes nothing for a missing value or a number that is not finite", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(Number.NaN)).toBe("");
    expect(csvField(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("toCsv", () => {
  it("ends every record with CRLF", () => {
    expect(
      toCsv([
        ["Student", "Q1"],
        ["Ava", 1],
      ]),
    ).toBe("Student,Q1\r\nAva,1\r\n");
  });

  it("writes an empty table as nothing", () => {
    expect(toCsv([])).toBe("");
  });

  it("keeps an empty cell between its neighbours", () => {
    expect(toCsv([["Ben", null, 2]])).toBe("Ben,,2\r\n");
  });
});
