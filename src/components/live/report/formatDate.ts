// Pinned to UTC so a date renders the same on the server and in any browser.
const SESSION_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function formatSessionDate(iso: string): string {
  return SESSION_DATE.format(new Date(iso));
}
