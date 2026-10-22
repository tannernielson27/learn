import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { stemExcerpt } from "./banks";
import { isMissingFunctionError } from "./quizMove";
import { QUIZ_ORDER_ERRORS, quizOrderError, type QuizEntry } from "./quizOrder";

type Client = SupabaseClient<Database>;

export type QuizOrderRead = { ok: true; entries: QuizEntry[] } | { ok: false; error: string };
export type QuizOrderWrite = { ok: true } | { ok: false; error: string };

type EntryRow = Database["public"]["Functions"]["list_quiz_entries"]["Returns"][number];

/** What a question with no text yet is called, as the quiz page calls it. */
const UNTITLED = "Untitled question";

const STATUS_LABELS: Record<string, string> = { draft: "Draft", published: "Published" };

function formatLabel(type: string | null): string {
  if (type === null) return "";
  return (ITEM_TYPES as readonly string[]).includes(type)
    ? ITEM_TYPE_LABELS[type as ItemType]
    : type;
}

/** One row of list_quiz_entries as the screen shows it; a row of another kind is skipped. */
function toEntry(row: EntryRow): QuizEntry | null {
  const status = STATUS_LABELS[row.status] ?? row.status;
  if (row.kind === "case_study") {
    return { kind: "case_study", id: row.id, label: row.title, format: "Case study", status };
  }
  if (row.kind === "item") {
    return {
      kind: "item",
      id: row.id,
      label: stemExcerpt(row.stem) || UNTITLED,
      format: formatLabel(row.type),
      status,
    };
  }
  return null;
}

/**
 * The quiz's current loose questions and case studies in its order, under RLS: another
 * workspace's quiz lists nothing. Only a question's stem is read, never its key or rationale.
 */
export async function listQuizEntries(client: Client, bankId: string): Promise<QuizOrderRead> {
  const { data, error } = await client.rpc("list_quiz_entries", { target_bank: bankId });
  if (isMissingFunctionError(error)) return { ok: false, error: QUIZ_ORDER_ERRORS.notReady };
  if (error || !data) {
    return { ok: false, error: "The questions and case studies could not be loaded." };
  }
  const entries = data.map(toEntry).filter((entry): entry is QuizEntry => entry !== null);
  return { ok: true, entries };
}

/** Saves the whole order in one call: every entry gets its place, or none does. */
export async function saveQuizOrder(
  client: Client,
  bankId: string,
  ids: readonly string[],
): Promise<QuizOrderWrite> {
  const { error } = await client.rpc("reorder_quiz", {
    target_bank: bankId,
    entry_ids: [...ids],
  });
  if (error) return { ok: false, error: quizOrderError(error) };
  return { ok: true };
}
