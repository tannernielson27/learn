/**
 * Up to two letters for the account button: "Chidinma Okonkwo" is "CO", "sam@example.com" is
 * "S". Decoration only; the button's name is "Account menu" and the name itself sits beside it.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
export function accountInitials(shown: string): string {
  const name = shown.includes("@") ? (shown.split("@")[0] ?? "") : shown;
  const words = name
    .split(/[\s._-]+/)
    .map((word) => word.trim())
    .filter((word) => word !== "");
  if (words.length === 0) return "?";
  const first = [...(words[0] as string)][0] ?? "";
  const last =
    words.length > 1 && !shown.includes("@") ? ([...(words.at(-1) as string)][0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}
