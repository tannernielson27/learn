import { longBankMd, sixtyDocx, sixtyPdf } from "./bankDocuments";
import { caseStudyMd } from "./caseStudy";
import { formattingDocx } from "./formatting";
import type { CorpusDocument } from "./shared";

/**
 * The real-size corpus documents (#594), each with its expected file and its recording, made
 * from the question bank and the case study written in this folder. The same input gives the
 * same bytes on every machine, and `generated.test.ts` holds the committed files to them.
 *
 * To write them again after a change here (PowerShell):
 *
 *   $env:AI_IMPORT_WRITE_CORPUS = "1"; pnpm exec vitest run test/ai-import/generated.test.ts
 *   pnpm exec prettier --write test/ai-import/corpus test/ai-import/recordings
 */
export function generateCorpus(): CorpusDocument[] {
  return [sixtyDocx(), longBankMd(), formattingDocx(), caseStudyMd(), sixtyPdf()];
}

export type { CorpusDocument, ExpectedFile, RecordingFile } from "./shared";
