import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { Landing } from "./Landing";
import { DEMO_ITEM } from "./liveDemo";

/**
 * #563: the landing page's picture of a live session is drawn from a gallery question, so its key
 * and rationale must never reach the page. Everything the page sends is what the server renders:
 * its one client component around the picture (`PlayOnce`) takes no data, only the children the
 * server drew, so the rendered HTML is the payload's content. The e2e landing spec greps the real
 * response bytes for the same markers.
 */
const KEY_MARKERS = [
  "answerKey",
  "correctOptionId",
  "correctOptionIds",
  // Not "rationale" alone: the page says that a rationale is shown, which is true.
  "perElement",
  "maxPoints",
  '"score":',
  '"points"',
  "isCorrect",
] as const;

/** Every piece of the fixture that marks an answer or explains it. */
function keyFields(): string[] {
  const { rationale, answerKey, content } = DEMO_ITEM;
  const correct = content.options.find((option) => option.id === answerKey.correctOptionId);
  return [
    ...KEY_MARKERS,
    rationale?.general?.value ?? "",
    ...Object.values(rationale?.perElement ?? {}).map((text) => text?.value ?? ""),
    // The key itself, by id, and every option id: the page letters options, it never names them.
    answerKey.correctOptionId,
    ...content.options.map((option) => option.id),
    DEMO_ITEM.id,
    correct === undefined ? "" : `${correct.id}"`,
  ].filter((field) => field !== "");
}

function leaks(html: string): string[] {
  return keyFields().filter((field) => html.includes(field));
}

const VISITOR = {
  href: "/sign-up",
  label: "Start your free trial",
  also: { href: "/sign-in", label: "Sign in" },
};

describe("the landing page carries no answer key (#563)", () => {
  it("renders the gallery question's words and none of its key or rationale", () => {
    const html = renderToStaticMarkup(<Landing entry={VISITOR} />);
    // The question is really there: the same read does find what the page carries.
    expect(html).toContain(DEMO_ITEM.stem.value);
    for (const option of DEMO_ITEM.content.options) expect(html).toContain(option.label);
    expect(leaks(html)).toEqual([]);
  });

  it("would catch it: the same check finds the rationale and the key in a page that has them", () => {
    const leaky = renderToStaticMarkup(
      <div data-answer={JSON.stringify(DEMO_ITEM.answerKey)}>
        <Landing entry={VISITOR} />
        <p>{DEMO_ITEM.rationale?.general?.value}</p>
      </div>,
    );
    expect(leaks(leaky)).toEqual(
      expect.arrayContaining([
        "correctOptionId",
        DEMO_ITEM.rationale?.general?.value,
        DEMO_ITEM.answerKey.correctOptionId,
      ]),
    );
  });
});
