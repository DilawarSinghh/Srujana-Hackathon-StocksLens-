import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * GET    /api/documents/[id]  — fetch one of this user's documents.
 * DELETE /api/documents/[id]  — delete the row (chunks cascade) + storage file.
 * RLS restricts every query to auth.uid(); we also filter explicitly.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await supabase
    .from("user_documents")
    .select("id, filename, page_count, status, red_flags, summary, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ document: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Look up the storage path (ownership enforced by RLS + explicit filter).
  const { data: doc } = await supabase
    .from("user_documents")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: true });

  // Remove the storage object first (best-effort), then the row. Chunks cascade.
  if (doc.storage_path) {
    await supabase.storage.from("user-docs").remove([doc.storage_path]);
  }
  const { error } = await supabase
    .from("user_documents")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
