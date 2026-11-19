import { describe, it } from "vitest";

/**
 * The real-size documents through the product's own code with a scripted client (#594). Not
 * written yet: the documents, their expected files and their recordings are in, and
 * `generated.test.ts` and `corpus.test.ts` cover them. Each line below is a test still to write.
 */
describe("real-size documents through the import, with a scripted model", () => {
  // prepareFile, segmentChunk per chunk, mergeSegments, planExtraction, extractUnit, staging.
  it.todo("stages exactly 60, 120, 11 and 60 questions, none lost or repeated at a chunk boundary");
  // Document 11: steps in two chunks, grouped by the title each step heading repeats.
  it.todo("assembles the case study across the chunk boundary as one case study of six steps");
  // Document 10: parts A and B ready with check_key; the three part C questions with no key.
  it.todo("keeps the bold and red keys with a check reason, and keys none of the three controls");
  // Document 08: max_tokens above N questions a call, so the chunk is read as two halves.
  it.todo("reads the 60-question chunk in halves when one call overflows, each question once");
  // At about 150 tokens a listed question (config.ts), over the old 8,000 and inside 16,000.
  it.todo("a faithful segment answer for the densest chunk fits SEGMENT_MAX_TOKENS, not 8,000");
});
