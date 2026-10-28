/** The first of `${prefix}1` … `${prefix}99` not in `taken`, for a new row, column, blank or word. */
export function unusedId(prefix: string, taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }
  return `${prefix}${Date.now()}`;
}

/** The first of `opt_a` … `opt_z` no option has yet, for a new answer option. */
export function nextOptionId(existing: readonly { id: string }[]): string {
  const taken = new Set(existing.map((option) => option.id));
  for (let i = 0; i < 26; i += 1) {
    const candidate = `opt_${String.fromCharCode(97 + i)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `opt_${Date.now()}`;
}
