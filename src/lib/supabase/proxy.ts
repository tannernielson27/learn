import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { readSupabasePublicEnv } from "./env";

export interface SessionUpdate {
  response: NextResponse;
  signedIn: boolean;
}

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
    return { response, signedIn: false };
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
    return { response, signedIn: Boolean(data?.claims?.sub) };
  } catch {
    return { response, signedIn: false };
  }
}
