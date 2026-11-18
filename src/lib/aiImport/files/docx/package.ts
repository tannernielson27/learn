import { attr, elements, parseXml } from "./xml";

/**
 * Where a Word package keeps its main document (#592). Word names it `word/document.xml`, but the
 * format only says that `_rels/.rels` points to it: files saved by other tools, and ones Word
 * itself has repaired, use `word/document2.xml` and the like, and were refused as "not a Word
 * file". The name read here is only ever compared with the zip's entry names, never used as a
 * path.
 */

export const PACKAGE_RELS = "_rels/.rels";
export const DEFAULT_MAIN_PART = "word/document.xml";

/** The relationship type of the main document, in both the transitional and the strict schema. */
const OFFICE_DOCUMENT = /\/officeDocument$/;
const MAX_PART_NAME = 260;

/** A relationship target as a zip entry name; null for one that is not a plain part name. */
function partName(target: string | null): string | null {
  if (!target) return null;
  const name = target.replace(/^\/+/, "");
  if (name === "" || name.length > MAX_PART_NAME) return null;
  if (name.includes("..") || /[\\:?#]/.test(name)) return null;
  return name;
}

/** The main document's target in `_rels/.rels`; null when it names none, or does not parse. */
function relsTarget(relsText: string): string | null {
  try {
    const root = parseXml(relsText).documentElement;
    if (!root) return null;
    for (const el of elements(root)) {
      if (el.localName !== "Relationship") continue;
      if (!OFFICE_DOCUMENT.test(attr(el, "Type") ?? "")) continue;
      if ((attr(el, "TargetMode") ?? "").toLowerCase() === "external") continue;
      return partName(attr(el, "Target"));
    }
  } catch {
    // Relationships that do not read leave the usual name to try.
  }
  return null;
}

/**
 * The entry that holds the main document: the one `_rels/.rels` names when the zip has it, else
 * `word/document.xml`. Null when the zip has neither.
 */
export function mainPartName(relsText: string | null, names: readonly string[]): string | null {
  const named = relsText === null ? null : relsTarget(relsText);
  if (named !== null && names.includes(named)) return named;
  return names.includes(DEFAULT_MAIN_PART) ? DEFAULT_MAIN_PART : null;
}

/** A part beside the main document (`word/styles.xml` beside `word/document2.xml`). */
export function siblingPart(mainPart: string, fileName: string): string {
  return `${mainPart.slice(0, mainPart.lastIndexOf("/") + 1)}${fileName}`;
}
