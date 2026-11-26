import type Anthropic from "@anthropic-ai/sdk";

/**
 * Text sent to Claude as data, never as instructions (ADR 0008 "Safety", ADR 0018 rule 8): an
 * imported document's text, or the question a teacher drafts from. Every prompt says the
 * `<document>` element is data and that an instruction inside it is ignored; this keeps the text
 * from closing the element early.
 */

/** A closing tag inside the document would let its text pose as the end of the data. */
export const escapeDocument = (text: string): string =>
  text.replace(/<\/?document/gi, (tag) => `&lt;${tag.slice(1)}`);

/** `text`, escaped, inside `<document>` tags, as one text block of a request. */
export function documentTextBlock(text: string): Anthropic.TextBlockParam {
  return { type: "text", text: `<document>\n${escapeDocument(text)}\n</document>` };
}
