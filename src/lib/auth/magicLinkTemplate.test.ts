// #206: the magic-link email that Supabase Auth sends, locally and (pasted by hand) on the hosted
// projects. Holds the parts that sign-in depends on while the look of it changes.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TEMPLATE = readFileSync(
  path.resolve(import.meta.dirname, "..", "..", "..", "supabase", "templates", "magic_link.html"),
  "utf8",
);

describe("supabase/templates/magic_link.html", () => {
  it("keeps the token_hash link to /auth/confirm, with Supabase's variables intact", () => {
    expect(TEMPLATE).toContain('href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email"');
  });

  it("uses no other template variables, so the hosted paste cannot break on a missing one", () => {
    const variables = [...TEMPLATE.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
    expect(new Set(variables)).toEqual(new Set([".RedirectTo", ".TokenHash"]));
  });

  it("reads right for an instructor and for a student joining a class", () => {
    expect(TEMPLATE).toContain("<title>Sign in to LeaRN</title>");
    expect(TEMPLATE).toMatch(/whether\s+you teach them or are joining one/);
    expect(TEMPLATE).toMatch(/expires in an hour/);
  });

  it("is plain and accessible: a language, inline styles only, no comments, no emoji", () => {
    expect(TEMPLATE).toMatch(/<html lang="en">/);
    expect(TEMPLATE).not.toMatch(/<style|<link|<script/);
    expect(TEMPLATE).not.toContain("<!--");
    expect(TEMPLATE).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const table of TEMPLATE.match(/<table[^>]*>/g) ?? []) {
      expect(table).toContain('role="presentation"');
    }
  });
});
