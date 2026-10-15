// #342: a Sentry event from a failed parse carries no document text (ADR 0008, "Safety").
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/scrub";
import { ClaudeCallError, callStructured, type MessagesClient } from "./claude";
import { readSegment, segmentRequest } from "./segment";
import { reply } from "./testing/messages";

const DOCUMENT = "Ms. Harriet Vandermolen, 67, reports crushing chest pain radiating to the jaw.";
const CHUNK = { position: 0, of: 1, pageFrom: null, pageTo: null };

describe("a failed parse in Sentry", () => {
  it("carries no document text, request or answer", async () => {
    const payload = { type: "text" as const, text: DOCUMENT };
    const request = segmentRequest(payload, "md", CHUNK);
    const client: MessagesClient = {
      messages: { create: async () => reply(`{"questions":[{"excerpt":"${DOCUMENT}"`) },
    };
    const error = (await callStructured(client, request, { sleep: async () => {} }).catch(
      (e: unknown) => e,
    )) as ClaudeCallError;
    expect(error).toBeInstanceOf(ClaudeCallError);

    let shapeError: unknown;
    try {
      readSegment({ questions: [{ excerpt: DOCUMENT }] }, CHUNK, payload);
    } catch (caught) {
      shapeError = caught;
    }

    // The worst a route could hand Sentry: the errors, plus the request, the answer and the
    // segment under the names the pipeline uses for them.
    const event = {
      message: error.message,
      exception: {
        values: [error, shapeError as Error].map((e) => ({ type: e.name, value: e.message })),
      },
      extra: {
        content: request.content,
        messages: [{ role: "user", content: request.content }],
        system: request.system,
        document: DOCUMENT,
        text: DOCUMENT,
        excerpt: DOCUMENT,
        sourceExcerpt: DOCUMENT,
        source_excerpt: DOCUMENT,
        draft: { stem: DOCUMENT },
        segment: { questions: [{ excerpt: DOCUMENT }] },
        questions: [{ excerpt: DOCUMENT }],
        answers: [{ text: DOCUMENT }],
        prompt: DOCUMENT,
        chunk: { position: 0, code: error.code },
      },
      request: {
        method: "POST",
        url: "https://learn.example/author/import",
        data: DOCUMENT,
        body: DOCUMENT,
      },
      breadcrumbs: [{ category: "fetch", data: { body: DOCUMENT, responseBody: DOCUMENT } }],
    };
    const scrubbed = JSON.stringify(scrubEvent(event));
    expect(scrubbed).not.toContain("Vandermolen");
    expect(scrubbed).not.toContain("chest pain");
    // What is kept is enough to trace the failure.
    expect(scrubbed).toContain("invalid_json");
    expect(scrubbed).toContain('"position":0');

    const crumb = JSON.stringify(scrubBreadcrumb({ message: "parse", data: { text: DOCUMENT } }));
    expect(crumb).not.toContain("Vandermolen");
  });
});
