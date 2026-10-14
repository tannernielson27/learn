/** Where a student practises a quiz (#241), and how far along the Practice list says they are. */
export function practicePath(bankId: string): string {
  return `/learn/practice/${bankId}`;
}

const questionsLabel = (count: number): string =>
  count === 1 ? "1 question" : `${count} questions`;

/** "12 questions", "3 of 12 done", or "All 12 done". */
export function practiceProgressLabel(bank: { itemCount: number; answered: number }): string {
  if (bank.answered <= 0) return questionsLabel(bank.itemCount);
  if (bank.answered >= bank.itemCount) return `All ${bank.itemCount} done`;
  return `${bank.answered} of ${bank.itemCount} done`;
}
