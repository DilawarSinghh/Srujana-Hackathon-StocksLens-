import { NextResponse } from "next/server";

/** Chat backend scaffold. Guardrails + RAG streaming land in Phase 8. */
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet. Chat arrives in Phase 8." },
    { status: 501 },
  );
}
