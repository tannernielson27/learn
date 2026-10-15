import { zlibSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { inspectPdf } from "./pdf";
import { guardPdfStreams } from "./pdfGuard";
import { buildPdf, utf8 } from "./testing/fixtures";

/** A PDF whose one object stream decodes to `decoded` bytes of zeros. */
function objectStreamPdf(decoded: number, filter = "/FlateDecode"): Uint8Array {
  const data =
    filter === "/FlateDecode" ? zlibSync(new Uint8Array(decoded), { level: 1 }) : utf8("x");
  const head = utf8(
    `%PDF-1.7\n1 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter ${filter} /Length ${data.length} >>\nstream\n`,
  );
  const tail = utf8("\nendstream\nendobj\ntrailer\n<< /Root 2 0 R >>\n%%EOF\n");
  const out = new Uint8Array(head.length + data.length + tail.length);
  out.set(head, 0);
  out.set(data, head.length);
  out.set(tail, head.length + data.length);
  return out;
}

/** 70 MB of object stream, past the 64 MB budget. Built once: it takes a moment on a slow runner. */
let bomb: Uint8Array;
beforeAll(() => {
  bomb = objectStreamPdf(70 * 1024 * 1024);
}, 60_000);

describe("guardPdfStreams", { timeout: 30_000 }, () => {
  it("passes an ordinary PDF, object streams and all", async () => {
    expect(guardPdfStreams(await buildPdf(30))).toBe("ok");
    expect(guardPdfStreams(objectStreamPdf(1024 * 1024))).toBe("ok");
  });

  it("refuses object streams that decode past the budget, from a small file", () => {
    expect(bomb.length).toBeLessThan(1_000_000);
    expect(guardPdfStreams(bomb)).toBe("too_complex");
    expect(guardPdfStreams(objectStreamPdf(4096), 1024)).toBe("too_complex");
  });

  it("refuses an object stream with a filter it does not count", () => {
    expect(guardPdfStreams(objectStreamPdf(0, "/LZWDecode"))).toBe("too_complex");
  });

  it("leaves damaged stream data to the load that follows", () => {
    const pdf = utf8(
      "%PDF-1.7\n1 0 obj\n<< /Type /XRef /Filter /FlateDecode >>\nstream\nnot zlib at all\nendstream\nendobj\n",
    );
    expect(guardPdfStreams(pdf)).toBe("ok");
  });

  it("makes inspectPdf refuse the bomb before loading it", async () => {
    expect(await inspectPdf(bomb)).toMatchObject({ ok: false, code: "too_complex" });
  });
});
