import { expect, type BrowserContext, type Page, type Request, type Route } from "@playwright/test";

// The real response bytes a student's browser is handed, and the greps run over them (#146, #244).
// Every negative grep here needs a control somewhere that proves the same grep can match.

/** What only a key, a rationale's owner or a score would put in a response. */
export const KEY_MARKERS = [
  "answerKey",
  "correctOptionId",
  "correctOptionIds",
  '"score":',
  // The wire name of a total's maximum (`best.maxScore`); the database column never reaches a page.
  "maxScore",
] as const;

/** A live item's marks as well (#244): `"points"` is a `ScoreResult`'s, and only a reveal has one. */
export const LIVE_KEY_MARKERS = [...KEY_MARKERS, '"points"'] as const;

/**
 * The bytes as a grep should see them. A page's GET carries its Flight payload as JSON strings
 * inside `self.__next_f.push(...)`, so a key there is written `\"score\":`, which a plain
 * `'"score":'` never matches. Unescaping the quotes lets one marker find a key in HTML, in a
 * Server Action's raw Flight and in a JSON body alike. A grep can only be made to match more by
 * this, never less.
 */
export function wireText(bytes: string): string {
  // To a fixed point, so a payload escaped twice (a JSON string inside a JSON string) is read too.
  let text = bytes;
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replaceAll('\\"', '"');
  }
  return text;
}

/** The bytes a page's own GET returns to this browser: the HTML and its inline Flight payload. */
export async function bytesOf(context: BrowserContext, path: string): Promise<string> {
  const response = await context.request.get(path);
  expect(response.ok()).toBe(true);
  return wireText(await response.text());
}

/**
 * The raw response to the first request `act` makes that `matches` picks, as the browser was
 * handed it. Captured by routing the request through the test and fulfilling the page with the
 * same bytes, because Chromium drops a streamed body before `response.text()` can read it. The
 * request's own body comes back too, for a test that wants to send it again.
 */
export async function capturedBytes(
  page: Page,
  matches: (request: Request) => boolean,
  act: () => Promise<void>,
): Promise<{ body: string; sent: string | null; status: number }> {
  let captured: { body: string; sent: string | null; status: number } | undefined;
  const handler = async (route: Route) => {
    const request = route.request();
    if (captured !== undefined || !matches(request)) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    captured = { body, sent: request.postData(), status: response.status() };
    await route.fulfill({ response, body });
  };
  await page.route("**/*", handler);
  try {
    await act();
    await expect.poll(() => captured !== undefined, { timeout: 15_000 }).toBe(true);
  } finally {
    await page.unroute("**/*", handler);
  }
  expect(captured?.body.length ?? 0).toBeGreaterThan(0);
  return {
    body: wireText(captured?.body ?? ""),
    sent: captured?.sent ?? null,
    status: captured?.status ?? 0,
  };
}

/**
 * The raw response of the Server Action a click sends (the POST carrying Next-Action): the Flight
 * stream Next replays into the page, which a leak could ride without ever reaching a plain GET.
 */
export async function actionBytes(page: Page, act: () => Promise<void>): Promise<string> {
  const { body } = await capturedBytes(
    page,
    (request) => request.method() === "POST" && "next-action" in request.headers(),
    act,
  );
  return body;
}

export function expectKeyless(
  bytes: string,
  rationales: readonly string[],
  markers: readonly string[] = KEY_MARKERS,
): void {
  const text = wireText(bytes);
  for (const rationale of rationales) expect(text).not.toContain(rationale);
  for (const marker of markers) expect(text).not.toContain(marker);
}
