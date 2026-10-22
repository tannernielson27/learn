/**
 * The library's quiz search (Library mockup): it narrows the quizzes already listed in the open
 * view, in the browser, by name. Nothing is read again; a folder's quizzes are searched in it.
 */

/** Lower case with accents taken off, so "pediatrie" finds "Pédiatrie". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** True when every word typed is somewhere in the name; an empty search matches everything. */
export function matchesQuizSearch(name: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const folded = fold(name);
  return words.every((word) => folded.includes(word));
}

/** The line read out as the list narrows; null while nothing is typed. */
export function quizSearchSummary(shown: number, total: number, query: string): string | null {
  const typed = query.trim();
  if (typed === "") return null;
  if (shown === 0) return `No quizzes here match “${typed}”.`;
  return `${shown} of ${total} ${total === 1 ? "quiz" : "quizzes"} match “${typed}”.`;
}
