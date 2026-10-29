// The three things `scripts/beta-pass.mjs` does (#520), each through one service-role function.
// A client is handed in, so the e2e suite issues passes with the same code the owner runs.
import { newToken, passLink, tokenHash } from "./token.mjs";

/**
 * Issues a pass. Answers `{ status: "issued", link, expiresAt }` or `{ status, link: null }` for a
 * refusal. The link is the only place the token ever appears: it is never sent to the database,
 * never logged, and returned once.
 */
export async function issuePass(
  client,
  { email, note, origin, createdBy = "scripts/beta-pass.mjs" },
) {
  const token = newToken();
  const { data, error } = await client.rpc("issue_beta_pass", {
    p_email: email,
    p_token_hash: tokenHash(token),
    p_note: note,
    p_created_by: createdBy,
  });
  if (error)
    throw new Error(`issue_beta_pass failed (${error.code ?? "no code"}): ${error.message}`);
  const row = data?.[0];
  if (row?.status !== "issued") return { status: row?.status ?? "unknown", link: null };
  return { status: "issued", link: passLink(origin, token), expiresAt: row.expires_at };
}

/** Every pass, newest first, as `list_beta_passes` returns them. */
export async function listPasses(client) {
  const { data, error } = await client.rpc("list_beta_passes");
  if (error)
    throw new Error(`list_beta_passes failed (${error.code ?? "no code"}): ${error.message}`);
  return data ?? [];
}

/** Revokes every pass for the address, and the grant each made. */
export async function revokePasses(client, email) {
  const { data, error } = await client.rpc("revoke_beta_pass", { p_email: email });
  if (error)
    throw new Error(`revoke_beta_pass failed (${error.code ?? "no code"}): ${error.message}`);
  const row = data?.[0] ?? { passes_revoked: 0, grants_revoked: 0 };
  return { passes: row.passes_revoked, grants: row.grants_revoked };
}

/** One line per pass, for `list`. No digest, no link: neither is stored anywhere readable. */
export function formatPasses(rows) {
  if (rows.length === 0) return "No passes yet.";
  return rows
    .map((row) => {
      const when = row.redeemed_at ?? row.created_at;
      const where = row.workspace_name ? ` "${row.workspace_name}"` : "";
      const access = row.redeemed_at ? (row.grant_active ? " access on" : " access off") : "";
      const note = row.note ? ` (${row.note})` : "";
      return `${row.state.padEnd(8)} ${row.email} ${when.slice(0, 10)}${where}${access}${note}`;
    })
    .join("\n");
}
