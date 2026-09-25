/**
 * A write an author confirmed (#256): removing a student, stopping a share, rotating a link.
 * `changed: false` is a delete that matched nothing, which means someone else already did it.
 * A failure carries only the database's error code, for the server log; its message text can
 * quote the row, so it never leaves this layer.
 */
export type ConfirmedWrite = { ok: true; changed: boolean } | { ok: false; code: string };

interface PostgrestReply {
  data: readonly unknown[] | null;
  error: { code?: string } | null;
}

export function failedWrite(error: { code?: string }): ConfirmedWrite {
  return { ok: false, code: error.code ?? "unknown" };
}

/** A delete that selected what it removed. */
export function deleteWrite({ data, error }: PostgrestReply): ConfirmedWrite {
  if (error) return failedWrite(error);
  return { ok: true, changed: (data?.length ?? 0) > 0 };
}
