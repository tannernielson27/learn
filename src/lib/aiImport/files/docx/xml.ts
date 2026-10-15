import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { DOCX_MAX_ELEMENTS } from "../limits";

/**
 * Small helpers over @xmldom/xmldom for WordprocessingML (#341). Elements are matched by their
 * local name, so a document that uses another prefix for the main namespace still reads.
 */

const ELEMENT_NODE = 1;

/** Thrown for XML the converter will not read: a DTD, or markup that does not parse. */
export class XmlRefused extends Error {}

/** Thrown for a part with more elements than `DOCX_MAX_ELEMENTS` (an open and a close tag each). */
export class XmlTooLarge extends Error {}

/**
 * Parses one part. Word never writes a DOCTYPE, and refusing one up front rules out entity
 * expansion ("billion laughs") and external entities, whatever the parser would do with them.
 */
export function parseXml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new XmlRefused("DTD in a Word part");
  // Every element costs memory once parsed; count the tags before building any of them.
  let tags = 0;
  for (let at = text.indexOf("<"); at !== -1; at = text.indexOf("<", at + 1)) {
    tags += 1;
    if (tags > DOCX_MAX_ELEMENTS * 2) throw new XmlTooLarge();
  }
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new XmlRefused(message);
    },
  });
  const doc = parser.parseFromString(text, "text/xml");
  if (!doc.documentElement) throw new XmlRefused("no root element");
  return doc;
}

export function elements(parent: Element): Element[] {
  const out: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === ELEMENT_NODE) out.push(node as Element);
  }
  return out;
}

export function child(parent: Element | undefined, name: string): Element | undefined {
  if (!parent) return undefined;
  return elements(parent).find((el) => el.localName === name);
}

/** An attribute by its local name (`w:val` is `val`), whatever its prefix. */
export function attr(el: Element | undefined, name: string): string | null {
  if (!el) return null;
  const attributes = el.attributes;
  for (let i = 0; i < attributes.length; i += 1) {
    const attribute = attributes.item(i);
    if (attribute && (attribute.localName ?? attribute.name) === name) return attribute.value;
  }
  return null;
}

/** A toggle property such as `<w:b/>`: on unless its value says off. */
export function toggle(el: Element | undefined): boolean {
  if (!el) return false;
  const value = attr(el, "val");
  return value === null || !["0", "false", "off", "none"].includes(value.toLowerCase());
}

export type { Document, Element };
