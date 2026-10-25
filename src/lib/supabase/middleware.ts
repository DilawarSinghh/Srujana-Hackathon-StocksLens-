import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Routes that require an authenticated user (the prefix and its sub-paths). */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/portfolio",
  "/documents",
  "/chat",
  "/debate",
  "/profile",
];

/**
 * Exact paths that require authentication but whose sub-paths are public. The
 * Stock Explorer (/stocks) is private, while stock detail pages
 * (/stocks/[symbol]) stay public and shareable.
 */
const PROTECTED_EXACT = ["/stocks"];

/**
 * Refreshes the Supabase session on every request and enforces route
 * protection. Keeps auth cookies in sync between the browser and server.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getPublicEnv();
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refreshes the session. Do not add logic between this and the
  // response return that could short-circuit cookie syncing.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Signed-in users never see the public landing page; send them to their
  // authenticated home. (Only the exact root — deep links are untouched.)
  if (pathname === "/" && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  const isProtected =
    PROTECTED_EXACT.includes(pathname) ||
    PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
