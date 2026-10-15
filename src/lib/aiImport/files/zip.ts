import { unzipSync } from "fflate";
import { DOCX_MAX_ENTRIES, DOCX_MAX_RATIO, DOCX_MAX_TOTAL_BYTES } from "./limits";

const RATIO_FLOOR_BYTES = 1024 * 1024;

/**
 * Reads named parts out of a zip without trusting it (#341). Nothing is written to disk, so an
 * entry's name is only ever compared, never used as a path. Only the parts asked for are
 * inflated, and each only after its declared size, its compression ratio and the running total
 * pass the limits; fflate inflates into a buffer of exactly the declared size, so a part that
 * lies about its size is cut short there (and then fails to parse), never larger.
 */

export type ZipFailure = "corrupt" | "too_complex";

export type ZipRead =
  { ok: true; names: string[]; parts: Map<string, Uint8Array> } | { ok: false; code: ZipFailure };

/** `wanted` maps a part's exact name to the most bytes it may expand to. */
export function readZip(bytes: Uint8Array, wanted: Readonly<Record<string, number>> = {}): ZipRead {
  const names: string[] = [];
  let total = 0;
  let tooComplex = false;
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        if (names.length > DOCX_MAX_ENTRIES) tooComplex = true;
        const max = Object.hasOwn(wanted, file.name) ? wanted[file.name] : undefined;
        if (tooComplex || max === undefined) return false;
        const ratio = file.originalSize / Math.max(file.size, 1);
        if (
          file.originalSize > max ||
          // A small part may compress very well (a run of empty cells); a large one may not.
          (file.originalSize > RATIO_FLOOR_BYTES && ratio > DOCX_MAX_RATIO) ||
          total + file.originalSize > DOCX_MAX_TOTAL_BYTES
        ) {
          tooComplex = true;
          return false;
        }
        total += file.originalSize;
        return true;
      },
    });
  } catch {
    return { ok: false, code: "corrupt" };
  }
  if (tooComplex) return { ok: false, code: "too_complex" };
  return { ok: true, names, parts: new Map(Object.entries(parts)) };
}

/** A part as UTF-8 text, or null when it is missing or is not UTF-8. */
export function partText(parts: Map<string, Uint8Array>, name: string): string | null {
  const bytes = parts.get(name);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}
