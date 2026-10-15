import { normalizeLine } from "./text";

/**
 * Inline markers in drafted prose (#338). A cloze sentence writes each blank where it falls,
 * `[[blank: a | b* | c]]`; a highlight passage writes each highlightable phrase as
 * `[[span: text]]`, with a `*` on the keyed ones. The model copies the prose around them word for
 * word; the converters turn the markers into tokens and ids.
 */

export type MarkerKind = "blank" | "span";

export type MarkerSegment =
  { kind: "text"; value: string } | { kind: MarkerKind; inner: string | undefined };

export interface MarkedProse {
  segments: MarkerSegment[];
  /** Pieces the converter could not read as a marker: a stray `[[`, or a kind it does not know. */
  unreadable: string[];
}

const MARKER = /\[\[\s*([A-Za-z]+)\s*(?::([\s\S]*?))?\]\]/g;
const STRAY = /\[\[|\]\]/;

/** Splits prose into text and markers. The prose is normalized as one line first. */
export function readMarkers(raw: string): MarkedProse {
  const prose = normalizeLine(raw);
  const segments: MarkerSegment[] = [];
  const unreadable: string[] = [];
  const pushText = (value: string) => {
    if (value === "") return;
    if (STRAY.test(value)) unreadable.push(value.trim());
    const last = segments.at(-1);
    if (last?.kind === "text") {
      segments[segments.length - 1] = { kind: "text", value: last.value + value };
    } else {
      segments.push({ kind: "text", value });
    }
  };
  let cursor = 0;
  for (const match of prose.matchAll(MARKER)) {
    pushText(prose.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const kind = match[1].toLowerCase();
    if (kind === "blank" || kind === "span") {
      const inner = match[2] === undefined ? undefined : match[2].trim();
      segments.push({ kind, inner });
    } else {
      unreadable.push(match[0]);
      pushText(match[0].replace(/\[\[|\]\]/g, ""));
    }
  }
  pushText(prose.slice(cursor));
  return { segments, unreadable };
}

/** Prose with a marker of the wrong kind turned back into its text, and the marker reported. */
export function onlyMarkers(prose: MarkedProse, kind: MarkerKind): MarkedProse {
  const unreadable = [...prose.unreadable];
  const segments: MarkerSegment[] = [];
  const pushText = (value: string) => {
    const last = segments.at(-1);
    if (last?.kind === "text") {
      segments[segments.length - 1] = { kind: "text", value: last.value + value };
    } else if (value !== "") {
      segments.push({ kind: "text", value });
    }
  };
  for (const segment of prose.segments) {
    if (segment.kind === "text") {
      pushText(segment.value);
    } else if (segment.kind === kind) {
      segments.push(segment);
    } else {
      unreadable.push(
        `[[${segment.kind}${segment.inner === undefined ? "" : `: ${segment.inner}`}]]`,
      );
      pushText(segment.inner ?? "");
    }
  }
  return { segments, unreadable };
}

/** The message for markers the converter could not read. Quoted, so nothing is lost silently. */
export const unreadableMessage = (pieces: readonly string[]): string =>
  `The converter could not read ${pieces.map((piece) => `"${piece}"`).join(", ")} as a marker; it was kept as plain text.`;
