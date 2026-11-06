import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextLink";
import { safeNextPath } from "@/lib/auth/nextPath";
import { requireAuthor } from "@/lib/authoring/session";
import { READ_ONLY_PATH } from "@/lib/authoring/writer";
import {
  READ_ONLY_BILLING_LINK,
  READ_ONLY_HEADING,
  readOnlySentence,
} from "@/lib/billing/billingCopy";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";

export const metadata: Metadata = { title: "Read-only" };

/**
 * Where a refused write lands (#521): a teacher in a workspace with no access, while billing is
 * enforced, pressed something that creates or changes. One sentence says why; the person who
 * started the workspace gets the way to Billing, everyone else is told to ask them. A link goes
 * back to where they were, which still reads as before.
 *
 * A teacher whose workspace may write (enforcement off, or access restored) is sent back at once.
 */
export default async function ReadOnlyPage({ searchParams }: PageProps<"/author/read-only">) {
  const { readOnly } = await requireAuthor(READ_ONLY_PATH);
  const { next } = await searchParams;
  const back = safeNextPath(typeof next === "string" ? next : null);
  if (!readOnly) redirect(back);

  return (
    <ReadingWidth>
      <h1 className="mb-6 font-read text-3xl text-ink-1">{READ_ONLY_HEADING}</h1>
      <Notice role="alert" className="mb-6">
        {readOnlySentence(readOnly.canManage)}
      </Notice>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {readOnly.canManage ? (
          <TextLink href={WORKSPACE_PATH}>{READ_ONLY_BILLING_LINK}</TextLink>
        ) : null}
        <TextLink href={back}>Go back</TextLink>
      </div>
    </ReadingWidth>
  );
}
