// Pinned to UTC so a date renders the same on the server and in any browser.
const EDITED_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function formatEdited(iso: string): string {
  return `Edited ${EDITED_DATE.format(new Date(iso))}`;
}

export function itemCountLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}
