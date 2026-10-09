import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { readSupabasePublicEnv } from "./env";
import { homeForAccount } from "./signedInHome";

export interface SessionUpdate {
  response: NextResponse;
  signedIn: boolean;
  /**
   * `target`, with the default after sign-in swapped for this person's own home (`homeForAccount`).
   * The token says who someone is and not what they are, so this is the one thing here that reads
   * the database: one profile row, and only when it is called with the default. The proxy calls it
   * for a signed-in visit to /sign-in and for nothing else, so no other request pays for it.
   * Signed out, it returns `target` untouched.
   */
  homeFor: (target: string) => Promise<string>;
}

const unchanged = async (target: string) => target;

/**
 * Refreshes the Supabase session cookies for this request, before anything renders, and reports
 * whether a valid session exists. `getClaims` verifies the token rather than trusting the cookie.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  let response = NextResponse.next({ request });

  let env;
  try {
    env = readSupabasePublicEnv();
  } catch {
    return { response, signedIn: false, homeFor: unchanged };
  }

  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // An auth outage or a corrupt cookie reads as signed out: protected pages redirect to sign-in
  // rather than every auth route returning a 500.
  try {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (typeof userId !== "string" || userId === "") {
      return { response, signedIn: false, homeFor: unchanged };
    }
    return {
      response,
      signedIn: true,
      homeFor: (target) => homeForAccount(supabase, userId, target),
    };
  } catch {
    return { response, signedIn: false, homeFor: unchanged };
  }
}
