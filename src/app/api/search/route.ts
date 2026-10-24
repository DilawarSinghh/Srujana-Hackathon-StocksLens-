import { NextResponse } from "next/server";

/** Stock search scaffold. ILIKE + pg_trgm matching lands in Phase 5. */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet. Search arrives in Phase 5." },
    { status: 501 },
  );
}
