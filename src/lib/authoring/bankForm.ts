export type BankFormResult = { ok: true; name: string } | { ok: false; error: string };

export const BANK_NAME_ERROR = "Give the bank a name of up to 120 characters.";

/** Matches the `item_banks.name` check constraint: 1 to 120 characters. */
const MAX_NAME_LENGTH = 120;

export function parseBankForm(formData: FormData): BankFormResult {
  const raw = formData.get("name");
  const name = (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: BANK_NAME_ERROR };
  }
  return { ok: true, name };
}
