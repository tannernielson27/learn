import { redirect } from "next/navigation";
import { noAccessRedirect } from "@/lib/auth/noAccess";
import { authorForRoute } from "@/lib/authoring/session";

/**
 * The old "No access yet" page (#204), kept only as a redirect (#362). An account with no role now
 * has somewhere to go: the welcome page, where it joins a class or sets up a workspace. Everyone
 * else is sent to their own home.
 */
export default async function NoAccessPage(): Promise<never> {
  const access = await authorForRoute();
  redirect(
    noAccessRedirect(access.status, access.status === "forbidden" ? (access.role ?? null) : null),
  );
}
