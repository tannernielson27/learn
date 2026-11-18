import { Decompress } from "fflate";
import { PDF_MAX_DECODED_BYTES } from "./limits";

/**
 * A PDF's bytes can expand far past 25 MB too (#341). Loading a PDF decodes its object and
 * cross-reference streams, with no cap of its own, so a small file can ask for gigabytes. This
 * scan decodes exactly those streams first, a little input at a time, and stops once their total
 * passes `PDF_MAX_DECODED_BYTES`. Page content and images are not decoded on load or when pages
 * are copied, so they are not counted: a scanned 100-page PDF is not refused for its pictures.
 */

export type PdfGuard = "ok" | "too_complex";

const STREAM = /stream\r?\n/g;
const INPUT_STEP = 16 * 1024;
/** How far back from `stream` the stream's dictionary is looked for. */
const DICTIONARY_WINDOW = 4096;

class OverBudget extends Error {}

/** The dictionary just before a `stream` keyword: from the nearest `obj` back. */
function dictionaryBefore(text: string, at: number): string {
  const window = text.slice(Math.max(0, at - DICTIONARY_WINDOW), at);
  const start = window.lastIndexOf("obj");
  return start === -1 ? window : window.slice(start);
}

function inflateCounting(data: Uint8Array, budget: { left: number }): void {
  const inflater = new Decompress((chunk) => {
    budget.left -= chunk.length;
    if (budget.left < 0) throw new OverBudget();
  });
  for (let i = 0; i < data.length; i += INPUT_STEP) {
    inflater.push(data.subarray(i, Math.min(i + INPUT_STEP, data.length)), false);
  }
}

interface GuardedStream {
  type: "ObjStm" | "XRef";
  /** Undefined for a filter the guard does not count, which is refused. */
  flate: boolean | undefined;
  data: Uint8Array;
}

/** The object and cross-reference streams of a PDF, found by their dictionaries. */
function* guardedStreams(bytes: Uint8Array): Generator<GuardedStream> {
  // latin1 maps each byte to one character, so string offsets are byte offsets.
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("latin1");
  for (const match of text.matchAll(STREAM)) {
    const at = match.index;
    if (at > 0 && text.slice(at - 3, at) === "end") continue; // `endstream`
    const dictionary = dictionaryBefore(text, at);
    const type = /\/Type\s*\/(ObjStm|XRef)\b/.exec(dictionary)?.[1] as GuardedStream["type"];
    if (!type) continue;
    const filters = dictionary.match(/\/[A-Za-z0-9]+Decode\b/g) ?? [];
    const start = at + match[0].length;
    const end = text.indexOf("endstream", start);
    yield {
      type,
      // Only FlateDecode is counted; any other filter on these streams is refused, not trusted.
      flate:
        filters.length === 0
          ? false
          : filters.every((filter) => filter === "/FlateDecode")
            ? true
            : undefined,
      data: bytes.subarray(start, end === -1 ? bytes.length : end),
    };
  }
}

export function guardPdfStreams(bytes: Uint8Array, maxDecoded = PDF_MAX_DECODED_BYTES): PdfGuard {
  const budget = { left: maxDecoded };
  for (const stream of guardedStreams(bytes)) {
    if (stream.flate === false) continue; // stored as it is: no larger than the file
    if (stream.flate === undefined) return "too_complex";
    try {
      inflateCounting(stream.data, budget);
    } catch (error) {
      if (error instanceof OverBudget) return "too_complex";
      // Damaged data: the load that follows decides whether the PDF is readable.
    }
  }
  return "ok";
}

/** Deflate never expands data by more than this. */
const MAX_DEFLATE_RATIO = 1032;

/**
 * The same bound for an encrypted PDF that is about to be decrypted (#592). Its object streams
 * are deflated and then encrypted, so they cannot be decoded here to be counted: the scan above
 * sees only noise. Their size is known, though, and deflate has a largest ratio, so the most they
 * could decode to is bounded without reading them. A PDF whose object streams could pass
 * `PDF_MAX_DECODED_BYTES` at that ratio is refused. Cross-reference streams are never encrypted
 * and were counted by `guardPdfStreams`.
 */
export function guardEncryptedPdfStreams(
  bytes: Uint8Array,
  maxDecoded = PDF_MAX_DECODED_BYTES,
): PdfGuard {
  let left = maxDecoded;
  for (const stream of guardedStreams(bytes)) {
    if (stream.type !== "ObjStm" || stream.flate === false) continue;
    if (stream.flate === undefined) return "too_complex";
    left -= stream.data.length * MAX_DEFLATE_RATIO;
    if (left < 0) return "too_complex";
  }
  return "ok";
}
