import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestPdf } from "@/lib/rag/ingest";
import { scanDocument, type ScanPage } from "@/lib/rag/doc-scan";
import {
  UPLOAD_LIMITS,
  UPLOAD_ERROR_MESSAGES,
  hasPdfSignature,
  validateUploadMeta,
} from "@/lib/rag/upload-limits";
import type { TablesInsert } from "@/types/database";

// PDF extraction (pdfjs-dist) requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET  /api/documents            — list this user's documents.
 * POST /api/documents            — upload + process a PDF (multipart form).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await supabase
    .from("user_documents")
    .select("id, filename, page_count, status, red_flags, summary, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    // Missing table (0008 not applied) → empty list + a readable notice, not 500.
    return NextResponse.json({
      documents: [],
      notice:
        "Document storage isn't set up yet (migration 0008 not applied).",
    });
  }
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Parse the multipart form.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  // Declared MIME + size validation.
  const metaErr = validateUploadMeta({
    type: file.type,
    size: file.size,
    name: file.name,
  });
  if (metaErr) {
    return NextResponse.json(
      { error: UPLOAD_ERROR_MESSAGES[metaErr] },
      { status: 400 },
    );
  }

  // Per-user document cap.
  const { count: docCount } = await supabase
    .from("user_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((docCount ?? 0) >= UPLOAD_LIMITS.maxDocumentsPerUser) {
    return NextResponse.json(
      { error: UPLOAD_ERROR_MESSAGES.too_many_documents },
      { status: 400 },
    );
  }

  // Hourly upload rate limit.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from("user_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((recent ?? 0) >= UPLOAD_LIMITS.maxUploadsPerHour) {
    return NextResponse.json(
      { error: UPLOAD_ERROR_MESSAGES.rate_limited },
      { status: 429 },
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());

  // Server-side file-signature check (defence beyond the declared MIME type).
  if (!hasPdfSignature(buf)) {
    return NextResponse.json(
      { error: UPLOAD_ERROR_MESSAGES.not_pdf },
      { status: 400 },
    );
  }

  // Create the document row (status: processing) so storage path can use its id.
  const { data: doc, error: insErr } = await supabase
    .from("user_documents")
    .insert({
      user_id: user.id,
      filename: file.name.slice(0, 200),
      storage_path: "", // set after we know the id
      status: "processing",
    } satisfies TablesInsert<"user_documents">)
    .select("id")
    .single();
  if (insErr || !doc) {
    // A missing table means migration 0008 hasn't been applied yet. Give a
    // readable 503 instead of an opaque 500.
    const missingTable = /relation .* does not exist|schema cache|user_documents/i.test(
      insErr?.message ?? "",
    );
    return NextResponse.json(
      {
        error: missingTable
          ? "Document storage isn't set up yet. An administrator needs to apply migration 0008."
          : "Could not create document.",
      },
      { status: missingTable ? 503 : 500 },
    );
  }

  const storagePath = `${user.id}/${doc.id}.pdf`;

  try {
    // Upload to the private per-user bucket folder.
    const { error: upErr } = await supabase.storage
      .from("user-docs")
      .upload(storagePath, buf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`storage: ${upErr.message}`);

    // Extract → chunk → embed via the shared module.
    const { pageCount, chunks } = await ingestPdf(buf, {
      company: file.name.replace(/\.pdf$/i, ""),
      docType: "user document",
      fiscalYear: new Date().getFullYear(),
    });

    if (pageCount > UPLOAD_LIMITS.maxPages) {
      throw new Error(
        `The document has ${pageCount} pages (limit ${UPLOAD_LIMITS.maxPages}).`,
      );
    }
    if (chunks.length === 0) {
      throw new Error("No extractable text (the PDF may be scanned images).");
    }

    // Insert chunks (batched).
    const rows: TablesInsert<"user_document_chunks">[] = chunks.map((c) => ({
      document_id: doc.id,
      user_id: user.id,
      page_number: c.pageNumber,
      section: c.section,
      content: c.content,
      embedding: c.embedding,
    }));
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: cErr } = await supabase
        .from("user_document_chunks")
        .insert(rows.slice(i, i + BATCH));
      if (cErr) throw new Error(`chunk insert: ${cErr.message}`);
    }

    // AI-assisted red-flag scan + neutral summary (best-effort).
    const scanPages: ScanPage[] = chunks.map((c) => ({
      pageNumber: c.pageNumber,
      section: c.section,
      content: c.content,
    }));
    const scan = await scanDocument(scanPages);

    await supabase
      .from("user_documents")
      .update({
        storage_path: storagePath,
        page_count: pageCount,
        status: "ready",
        summary: scan?.summary.join("\n") ?? null,
        red_flags: scan?.redFlags ?? null,
      })
      .eq("id", doc.id)
      .eq("user_id", user.id);

    return NextResponse.json({ id: doc.id, status: "ready" });
  } catch (e) {
    // Mark failed and clean up the partial upload.
    await supabase
      .from("user_documents")
      .update({ status: "failed", storage_path: storagePath })
      .eq("id", doc.id)
      .eq("user_id", user.id);
    await supabase.storage.from("user-docs").remove([storagePath]);
    return NextResponse.json(
      { error: `Processing failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
