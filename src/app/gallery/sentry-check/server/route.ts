import { notFound } from "next/navigation";
import { connection } from "next/server";
import { galleryIsAvailable } from "@/lib/gallery/availability";
import { SENTRY_CHECK_MESSAGE } from "../message";

/**
 * Throws on purpose, so the owner can confirm on a preview that server errors reach Sentry (#235,
 * docs/05 §7.9). Under `/gallery`, so `src/proxy.ts` answers 404 on production before this runs;
 * route handlers skip layouts, so it also refuses production itself (`gate.test.ts`).
 */
// No return type annotation: gate.test.ts reads handler heads in the `GET() {` shape.
export async function GET() {
  await connection();
  if (!galleryIsAvailable()) notFound();
  throw new Error(SENTRY_CHECK_MESSAGE("server"));
}
