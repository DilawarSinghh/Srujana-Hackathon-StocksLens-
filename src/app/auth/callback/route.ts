import { NextResponse } from "next/server";

/**
 * OAuth callback scaffold. Phase 2 implements exchangeCodeForSession and
 * redirects to the `next` param or "/".
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  return NextResponse.redirect(`${origin}${next}`);
}
