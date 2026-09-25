/** Where a student practises a bank (#241), and how far along the Practice list says they are. */
export function practicePath(bankId: string): string {
  return `/learn/practice/${bankId}`;
}

const itemsLabel = (count: number): string => (count === 1 ? "1 item" : `${count} items`);

/** "12 items", "3 of 12 done", or "All 12 done". */
export function practiceProgressLabel(bank: { itemCount: number; answered: number }): string {
  if (bank.answered <= 0) return itemsLabel(bank.itemCount);
  if (bank.answered >= bank.itemCount) return `All ${bank.itemCount} done`;
  return `${bank.answered} of ${bank.itemCount} done`;
}
