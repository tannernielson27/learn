import { isUuid } from "./ids";
import { readCaseStudyExport, readItemExport, TRANSFER_ERRORS } from "./importExport";
import { authorForRoute } from "./session";

/**
 * Where a request came from, by the browser's Sec-Fetch-Site header. An export carries answer keys,
 * so a download started from another site is refused even though the author's cookies ride along.
 * The page's own link is same-origin; an address typed or bookmarked is "none". Browsers that send
 * no header are allowed, since the header cannot be forged by a page.
 */
export function startedElsewhere(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/**
 * Downloads an item or case study as learn.v1 JSON, with its keys, for an author of its org. RLS
 * limits the read to that org; an unfinished item or case study says why instead of downloading.
 */
export async function exportDownload(
  request: Request,
  kind: "item" | "caseStudy",
  id: string,
): Promise<Response> {
  if (!isUuid(id)) return Response.json({ error: TRANSFER_ERRORS.notFound }, { status: 404 });
  if (startedElsewhere(request)) {
    return Response.json({ error: "Export from LeaRN itself." }, { status: 403 });
  }

  const author = await authorForRoute();
  if (author.status === "signed_out") {
    return Response.json({ error: "Sign in to export." }, { status: 401 });
  }
  if (author.status === "forbidden") {
    return Response.json({ error: "Only authors can export." }, { status: 403 });
  }

  const result =
    kind === "item"
      ? await readItemExport(author.supabase, id)
      : await readCaseStudyExport(author.supabase, id);
  if (!result.ok) {
    return Response.json(
      { error: result.error, blockers: result.blockers ?? [] },
      { status: result.status },
    );
  }

  const filename = `${kind === "item" ? "item" : "case-study"}-${id}.learn.json`;
  return new Response(JSON.stringify(result.envelope, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Exports carry answer keys: never kept by a browser or shared cache.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
