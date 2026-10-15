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

export function guardPdfStreams(bytes: Uint8Array, maxDecoded = PDF_MAX_DECODED_BYTES): PdfGuard {
  // latin1 maps each byte to one character, so string offsets are byte offsets.
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("latin1");
  const budget = { left: maxDecoded };
  for (const match of text.matchAll(STREAM)) {
    const at = match.index;
    if (at > 0 && text.slice(at - 3, at) === "end") continue; // `endstream`
    const dictionary = dictionaryBefore(text, at);
    if (!/\/Type\s*\/(ObjStm|XRef)\b/.test(dictionary)) continue;
    const filters = dictionary.match(/\/[A-Za-z0-9]+Decode\b/g) ?? [];
    if (filters.length === 0) continue; // stored as it is: no larger than the file
    // Only FlateDecode is counted; any other filter on these streams is refused, not trusted.
    if (filters.some((filter) => filter !== "/FlateDecode")) return "too_complex";
    const start = at + match[0].length;
    const end = text.indexOf("endstream", start);
    const data = bytes.subarray(start, end === -1 ? bytes.length : end);
    try {
      inflateCounting(data, budget);
    } catch (error) {
      if (error instanceof OverBudget) return "too_complex";
      // Damaged data: the load that follows decides whether the PDF is readable.
    }
  }
  return "ok";
}
