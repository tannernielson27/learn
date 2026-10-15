import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRACT_RULES } from "@/lib/aiImport/extract";
import { SEGMENT_RULES } from "@/lib/aiImport/segment";
import { CORPUS_DIR, loadExpected, loadRecordings, NOT_IMPORTABLE, type Recording } from "./files";
import { costOf, EVAL_MODEL, runPipeline, type MessagesClient } from "./pipeline";
import { buildReport, formatReport, isPerfect, scoreDocument } from "./score";

/**
 * The eval's pipeline, on the product's segment and extract passes (#343), with a fake client
 * that answers from a hand-written recording. No call leaves the machine.
 */

type Body = Anthropic.MessageCreateParamsNonStreaming;

const answer = (value: unknown, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
  ({
    content: [{ type: "text", text: JSON.stringify(value) }],
    stop_reason: stop,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 4000,
    },
  }) as unknown as Anthropic.Message;

const schemaOf = (body: Body) =>
  (body.output_config?.format?.schema ?? {}) as { properties?: Record<string, unknown> };
const askOf = (body: Body): string => {
  const content = body.messages[0].content as Anthropic.ContentBlockParam[];
  return (content[content.length - 1] as Anthropic.TextBlockParam).text;
};

interface CaseDraft {
  title: string;
  patient: unknown;
  charts: unknown;
  steps: { stem: string; type: string }[];
}

/** The first words of a stem, as the segment pass copies an opening. */
const opening = (stem: string) => stem.split(/\s+/).slice(0, 20).join(" ");

/** A client that answers each call the way the recording says the model did. */
function replaying(recording: Recording, overrides: { extract?: () => Anthropic.Message } = {}) {
  const cases = recording.caseStudies.map((entry) => entry.draft as CaseDraft);
  const entries = [
    ...cases.flatMap((draft) =>
      draft.steps.map((step) => ({
        opening: opening(step.stem),
        type: step.type,
        draft: step as unknown,
        reason: undefined as string | undefined,
        title: draft.title as string | undefined,
      })),
    ),
    ...recording.questions.map((question) => ({ ...question, title: undefined })),
  ];
  const quotedIn = (tag: string, ask: string) =>
    JSON.parse(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(ask)?.[1] ?? "{}");
  const calls: Body[] = [];
  const client: MessagesClient = {
    messages: {
      create: async (body) => {
        calls.push(body);
        const properties = schemaOf(body).properties ?? {};
        if ("questions" in properties) {
          return answer({
            questions: entries.map((entry) => ({
              excerpt: entry.opening,
              type: entry.type === NOT_IMPORTABLE ? "not_ngn" : entry.type,
              confidence: 0.9,
              ...(entry.title ? { caseStudy: { title: entry.title } } : {}),
              ...(entry.reason ? { notNgnReason: entry.reason } : {}),
              ...("chart" in entry && entry.chart !== undefined ? { ownChart: true } : {}),
              instructorNote: false,
              reliesOnImage: false,
              cutOff: false,
              continued: false,
            })),
            answers: [],
          });
        }
        if ("charts" in properties) {
          const { title: asked } = quotedIn("case_study", askOf(body)) as { title: string };
          const { title, patient, charts } = cases.find((draft) => draft.title === asked)!;
          return answer({ title, patient, charts });
        }
        if ("chart" in properties) {
          const { opens } = quotedIn("question", askOf(body)) as { opens: string };
          const question = recording.questions.find((candidate) => candidate.opening === opens);
          return answer(question?.chart ?? {});
        }
        if (overrides.extract) return overrides.extract();
        const asked = JSON.parse(
          /<questions>\n([\s\S]*)\n<\/questions>/.exec(askOf(body))?.[1] ?? "[]",
        ) as { field: string; opens: string }[];
        return answer(
          Object.fromEntries(
            asked.map((question) => {
              const entry = entries.find((candidate) => candidate.opening === question.opens);
              if (!entry) throw new Error(`the fake has no draft for: ${question.opens}`);
              return [question.field, { draft: entry.draft, sourceErrors: [] }];
            }),
          ),
        );
      },
    },
  };
  return { client, calls };
}

const recordings = loadRecordings();
const expected = loadExpected();
const bytesOf = (name: string) => readFileSync(join(CORPUS_DIR, name));
const noWait = async () => {};

describe("runPipeline", () => {
  it.each([
    "01-med-surg-review.md",
    "06-case-study-and-bowtie.md",
    "07-night-shift-case-and-trend.md",
  ])("%s: segments, extracts and assembles what the model returns", async (name) => {
    const { client, calls } = replaying(recordings.get(name)!);
    const recording = await runPipeline(
      client,
      { name, bytes: bytesOf(name) },
      { now: () => new Date("2026-10-14T12:00:00Z"), sleep: noWait },
    );
    expect(recording).toMatchObject({
      document: name,
      source: EVAL_MODEL,
      recordedAt: "2026-10-14T12:00:00.000Z",
    });
    const report = buildReport([
      scoreDocument(
        expected.find((doc) => doc.document === name)!,
        recording,
      ),
    ]);
    expect(isPerfect(report), formatReport(report)).toBe(true);

    // Every call is a structured-output call on the product's model, with the product's rules.
    for (const body of calls) {
      expect(body.model).toBe(EVAL_MODEL);
      expect(body.output_config?.format?.type).toBe("json_schema");
      const system = body.system as Anthropic.TextBlockParam[];
      expect([SEGMENT_RULES, EXTRACT_RULES]).toContain(system[0].text);
    }
    // One segment call (one chunk), the extracts two at a time, one call per question with a
    // chart of its own, and per case study group its steps two at a time and its charts.
    const drafted = recording.questions.filter((q) => q.type !== NOT_IMPORTABLE);
    const charted = drafted.filter((q) => q.chart !== undefined).length;
    const groups = recording.caseStudies.map(
      (entry) => Math.ceil((entry.draft as CaseDraft).steps.length / 2) + 1,
    );
    expect(calls).toHaveLength(
      1 + Math.ceil(drafted.length / 2) + charted + groups.reduce((a, b) => a + b, 0),
    );
    expect(recording.usage.inputTokens).toBe(calls.length * 5500);
    expect(recording.usage.costUsd).toBeGreaterThan(0);
  });

  it("keeps a question whose extract call fails, with the reason, and goes on", async () => {
    const name = "01-med-surg-review.md";
    const { client } = replaying(recordings.get(name)!, {
      extract: () => answer({}, "max_tokens"),
    });
    const recording = await runPipeline(client, { name, bytes: bytesOf(name) }, { sleep: noWait });
    const drafted = recording.questions.filter((q) => q.type !== NOT_IMPORTABLE);
    expect(drafted).toHaveLength(7);
    for (const question of drafted) {
      expect(question.draft).toBeUndefined();
      expect(question.reason).toBe("extract failed: the Claude call failed (max_tokens)");
    }
  });

  it("records a case study whose chart call fails with its steps and no chart", async () => {
    const name = "06-case-study-and-bowtie.md";
    const { client } = replaying(recordings.get(name)!);
    const failing: MessagesClient = {
      messages: {
        create: async (body) => {
          if ("charts" in (schemaOf(body).properties ?? {})) {
            return { ...answer({}), content: [] } as unknown as Anthropic.Message;
          }
          return client.messages.create(body);
        },
      },
    };
    const recording = await runPipeline(failing, { name, bytes: bytesOf(name) }, { sleep: noWait });
    const [caseStudy] = recording.caseStudies;
    expect(caseStudy.draft).toMatchObject({
      title: "Unfolding Case Study: Pneumonia With Worsening Condition",
    });
    expect((caseStudy.draft as CaseDraft).steps).toHaveLength(6);
    expect(caseStudy.draft).not.toHaveProperty("charts");
    const report = buildReport([
      scoreDocument(
        expected.find((doc) => doc.document === name)!,
        recording,
      ),
    ]);
    expect(report.caseStudies.passed).toBe(0);
  });

  it("records a case study whose step calls fail as an error the scorer counts", async () => {
    const name = "06-case-study-and-bowtie.md";
    const { client } = replaying(recordings.get(name)!, {
      extract: () => answer({}, "max_tokens"),
    });
    const recording = await runPipeline(client, { name, bytes: bytesOf(name) }, { sleep: noWait });
    expect(recording.caseStudies).toEqual([
      {
        draft: {
          title: "Unfolding Case Study: Pneumonia With Worsening Condition",
          error: "the Claude call failed (max_tokens)",
        },
      },
    ]);
  });

  it("fails the document when the segment pass returns something else", async () => {
    const client: MessagesClient = {
      messages: { create: async () => answer({ questions: [{ opening: 1 }] }) },
    };
    await expect(
      runPipeline(client, { name: "x.md", bytes: Buffer.from("# x\n\nSome text.") }),
    ).rejects.toThrow();
  });

  it("refuses a file the product would refuse", async () => {
    const client: MessagesClient = { messages: { create: async () => answer({}) } };
    await expect(runPipeline(client, { name: "a.pptx", bytes: Buffer.from("PK") })).rejects.toThrow(
      /a\.pptx: /,
    );
  });
});

describe("costOf", () => {
  it("prices tokens at the Sonnet 5.5 list price", () => {
    expect(
      costOf({ inputTokens: 1e6, outputTokens: 1e6, cacheWriteTokens: 1e6, cacheReadTokens: 1e6 }),
    ).toBeCloseTo(2 + 10 + 2.5 + 0.2);
  });
});
