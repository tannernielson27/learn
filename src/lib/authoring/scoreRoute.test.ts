import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { SUBMIT_ERRORS } from "@/lib/ngn/submit";
import { toItemRow } from "@/lib/supabase/itemRows";

const ITEM_ID = "3f8a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const item = multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical);
const publishedRow = { ...toItemRow(item), status: "published" };

let readResult: { data: unknown; error: unknown };
let author: { status: string; supabase?: unknown };

const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => readResult }) }),
  }),
};

vi.mock("@/lib/authoring/session", () => ({ authorForRoute: async () => author }));

const { scoreResponse, SCORE_ROUTE_ERRORS } = await import("./scoreRoute");

function post(body: string, { itemId = ITEM_ID, contentType = "application/json" } = {}) {
  const request = new Request(`https://learn.example/author/items/${itemId}/play/score`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  return scoreResponse(request, itemId);
}

const answer = (response: unknown) => JSON.stringify({ response });
const correct = answer({ type: "multiple_choice", optionId: "opt_a" });

async function expectFailure(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error });
}

beforeEach(() => {
  author = { status: "ok", supabase };
  readResult = { data: publishedRow, error: null };
});

describe("scoreResponse", () => {
  it("scores a published item and reveals its key, rationale and scoring with the score", async () => {
    const response = await post(correct);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.score.points).toBe(1);
    expect(body.answerKey).toEqual(item.answerKey);
    expect(body.rationale).toEqual(item.rationale);
    expect(body.scoring).toEqual(item.scoring);
    expect(body.score).toMatchObject({
      model: item.scoring.model,
      maxPoints: item.scoring.maxPoints,
    });
  });

  it("is not found for an id that is not a uuid", async () => {
    await expectFailure(
      await post(correct, { itemId: "not-an-id" }),
      404,
      SCORE_ROUTE_ERRORS.notFound,
    );
  });

  it("accepts JSON only, so a cross-site form post cannot reach it", async () => {
    await expectFailure(
      await post("response=opt_a", { contentType: "text/plain" }),
      415,
      SUBMIT_ERRORS.malformed,
    );
  });

  it("asks a signed-out caller to sign in", async () => {
    author = { status: "signed_out" };
    await expectFailure(await post(correct), 401, SCORE_ROUTE_ERRORS.signedOut);
  });

  it("refuses a signed-in user who is not an author", async () => {
    author = { status: "forbidden" };
    await expectFailure(await post(correct), 403, SCORE_ROUTE_ERRORS.forbidden);
  });

  it("refuses a body that is not JSON", async () => {
    await expectFailure(await post("{not json"), 400, SUBMIT_ERRORS.malformed);
  });

  it("refuses an answer too large to check", async () => {
    const huge = answer({ type: "multiple_choice", optionId: "x".repeat(210_000) });
    await expectFailure(await post(huge), 413, SCORE_ROUTE_ERRORS.tooLarge);
  });

  it("refuses a declared oversized body before reading it", async () => {
    const json = vi.fn(async () => ({}));
    const request = {
      headers: new Headers({ "content-type": "application/json", "content-length": "5000000" }),
      json,
    } as unknown as Request;
    await expectFailure(await scoreResponse(request, ITEM_ID), 413, SCORE_ROUTE_ERRORS.tooLarge);
    expect(json).not.toHaveBeenCalled();
  });

  it("reads an item the caller cannot see (RLS) as not found", async () => {
    readResult = { data: null, error: null };
    await expectFailure(await post(correct), 404, SCORE_ROUTE_ERRORS.notFound);
  });

  it("reads a draft as not found, so only published items are playable", async () => {
    readResult = { data: { ...publishedRow, status: "draft" }, error: null };
    await expectFailure(await post(correct), 404, SCORE_ROUTE_ERRORS.notFound);
  });

  it("says the item has a problem when its stored JSON is invalid", async () => {
    readResult = { data: { ...publishedRow, content: {} }, error: null };
    await expectFailure(await post(correct), 409, SCORE_ROUTE_ERRORS.unplayable);
  });

  it("refuses an answer written for a different item type", async () => {
    const wrong = answer({ type: "multiple_response", optionIds: ["opt_a"] });
    await expectFailure(await post(wrong), 400, SUBMIT_ERRORS.wrongType);
  });

  it("hides database errors behind a safe message", async () => {
    readResult = { data: null, error: { message: "relation items does not exist" } };
    await expectFailure(await post(correct), 500, SCORE_ROUTE_ERRORS.failed);
  });

  it("uses messages a person can read, with no internal details", () => {
    for (const message of Object.values(SCORE_ROUTE_ERRORS)) {
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message).not.toMatch(/rls|supabase|relation|uuid|schema/i);
    }
  });
});
