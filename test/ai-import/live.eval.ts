import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_IMPORT_DIR,
  CORPUS_DIR,
  expectedDocumentSchema,
  loadExpected,
  NOT_IMPORTABLE,
  type ExpectedDocument,
  type Recording,
} from "./files";
import { runPipeline } from "./pipeline";
import { buildReport, formatReport, scoreDocument, type DocumentScore } from "./score";

/**
 * `pnpm eval:ai-import` (#339): runs the import pipeline against the real API on the golden
 * corpus, and on the owner's samples in `.ai-import-samples/` when that folder is there, then
 * prints the per-type table. By hand only, never in CI: `pnpm test` does not include this file,
 * and it does nothing unless `AI_IMPORT_EVAL=1` (which the eval's config sets).
 *
 *   AI_IMPORT_EVAL_ONLY=scanned pnpm eval:ai-import    one corpus document, by name
 *   AI_IMPORT_EVAL_SAMPLES=0 pnpm eval:ai-import       the corpus only
 *
 * Output goes to `test/ai-import/out/` and `.ai-import-samples/out/eval/`, both gitignored.
 */

const ENABLED = process.env.AI_IMPORT_EVAL === "1";
const ROOT = resolve(AI_IMPORT_DIR, "../..");
const OUT_DIR = join(AI_IMPORT_DIR, "out");
const SAMPLES_DIR = join(ROOT, ".ai-import-samples");
const SAMPLE_TYPES = new Set([".pdf", ".docx", ".md", ".txt"]);

const write = (path: string, value: unknown) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
};

/** What a sample with no expected file came back as: counts only, never its text. */
function sampleSummary(name: string, recording: Recording): string {
  const types = new Map<string, number>();
  for (const question of recording.questions)
    types.set(question.type, (types.get(question.type) ?? 0) + 1);
  const drafted = recording.questions.filter((question) => question.draft !== undefined).length;
  const byType = [...types].map(([type, count]) => `${type} ${count}`).join(", ");
  return `- ${name}: ${recording.questions.length} questions (${byType || "none"}), ${drafted} drafted, ${recording.caseStudies.length} case studies, $${recording.usage?.costUsd.toFixed(3)}`;
}

describe.skipIf(!ENABLED)("AI import eval (live API)", () => {
  it("runs the corpus and the owner's samples, and reports accuracy per type", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY in .env.local to run the eval.");
    const client = new Anthropic({ apiKey, maxRetries: 4 });
    const only = process.env.AI_IMPORT_EVAL_ONLY;
    let cost = 0;

    const corpus = loadExpected().filter((doc) => !only || doc.document.includes(only));
    const scores: DocumentScore[] = [];
    for (const doc of corpus) {
      const recording = await runPipeline(client, {
        name: doc.document,
        bytes: readFileSync(join(CORPUS_DIR, doc.document)),
      });
      cost += recording.usage.costUsd;
      write(join(OUT_DIR, "recordings", doc.document.replace(/\.[a-z]+$/i, ".json")), recording);
      scores.push(scoreDocument(doc, recording));
    }
    const report = formatReport(buildReport(scores));
    write(join(OUT_DIR, "report.md"), report);
    console.log(`\nGolden corpus (${corpus.length} documents)\n\n${report}`);

    if (existsSync(SAMPLES_DIR) && process.env.AI_IMPORT_EVAL_SAMPLES !== "0") {
      const sampleOut = join(SAMPLES_DIR, "out", "eval");
      const summaries: string[] = [];
      const sampleScores: DocumentScore[] = [];
      const files = readdirSync(SAMPLES_DIR).filter((name) =>
        SAMPLE_TYPES.has(extname(name).toLowerCase()),
      );
      for (const name of files) {
        const recording = await runPipeline(client, {
          name,
          bytes: readFileSync(join(SAMPLES_DIR, name)),
        });
        cost += recording.usage.costUsd;
        write(join(sampleOut, `${name}.json`), recording);
        // An owner may write `<file>.expected.json` beside a sample; it is scored like the corpus.
        const expectedPath = join(SAMPLES_DIR, `${name}.expected.json`);
        if (existsSync(expectedPath)) {
          const expected: ExpectedDocument = expectedDocumentSchema.parse(
            JSON.parse(readFileSync(expectedPath, "utf8")),
          );
          sampleScores.push(scoreDocument({ ...expected, document: name }, recording));
        } else {
          summaries.push(sampleSummary(name, recording));
        }
      }
      const sampleReport = [
        sampleScores.length > 0 ? formatReport(buildReport(sampleScores)) : "",
        summaries.length > 0 ? `Samples with no expected file:\n\n${summaries.join("\n")}\n` : "",
      ].join("\n");
      write(join(sampleOut, "report.md"), sampleReport);
      console.log(
        `\nOwner samples (${files.length} files; report in .ai-import-samples/out/eval/)\n\n${sampleReport}`,
      );
    }

    console.log(
      `\nEstimated cost of this run: $${cost.toFixed(3)} (${NOT_IMPORTABLE} questions cost no extract call).`,
    );
    expect(corpus.length).toBeGreaterThan(0);
  });
});
