"use client";

import * as React from "react";
import { Upload, Trash2, Loader2, FileText, AlertTriangle } from "lucide-react";
import type { DocumentRedFlag, UserDocumentStatus } from "@/types/database";
import { UPLOAD_LIMITS } from "@/lib/rag/upload-limits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentChat } from "@/components/documents/document-chat";

interface DocItem {
  id: string;
  filename: string;
  page_count: number | null;
  status: UserDocumentStatus;
  red_flags: DocumentRedFlag[] | null;
  summary: string | null;
  created_at: string;
}

export function DocumentsPanel() {
  const [docs, setDocs] = React.useState<DocItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = (await res.json()) as { documents: DocItem[] };
        setDocs(data.documents ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
      } else {
        await load();
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    await load();
  }

  const active = docs.find((d) => d.id === activeId && d.status === "ready");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a document</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            PDF only, up to {UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB and{" "}
            {UPLOAD_LIMITS.maxPages} pages. Keep up to{" "}
            {UPLOAD_LIMITS.maxDocumentsPerUser} documents; {UPLOAD_LIMITS.maxUploadsPerHour}{" "}
            uploads per hour. Your documents are private to your account.
          </p>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              className="hidden"
              aria-label="Choose a PDF to upload"
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Processing…" : "Choose PDF"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-weak">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your documents</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents yet. Upload a PDF to analyse it privately.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => d.status === "ready" && setActiveId(d.id)}
                    className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-none"
                    disabled={d.status !== "ready"}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {d.filename}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {statusLabel(d.status)}
                        {d.page_count != null ? ` · ${d.page_count} pages` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(d.id)}
                    className="shrink-0 text-muted-foreground hover:text-weak"
                    aria-label={`Delete ${d.filename}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {active ? (
        <>
          {active.summary || (active.red_flags && active.red_flags.length > 0) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Filing red flags (AI-assisted, verify in the document)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                {active.summary ? (
                  <div>
                    <p className="mb-1 font-medium">Summary</p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {active.summary.split("\n").filter(Boolean).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {active.red_flags && active.red_flags.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {active.red_flags.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-md border border-weak/40 bg-weak/10 px-3 py-2"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-weak" />
                        <div>
                          <p className="font-medium text-weak">
                            {f.title}{" "}
                            <span className="font-normal text-muted-foreground">
                              (page {f.page})
                            </span>
                          </p>
                          <p className="text-muted-foreground">{f.explanation}</p>
                          <p className="mt-0.5 text-xs italic text-muted-foreground">
                            “{f.short_quote}”
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No red flags were detected.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <DocumentChat documentId={active.id} filename={active.filename} />
        </>
      ) : null}
    </div>
  );
}

function statusLabel(status: UserDocumentStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing…";
    case "failed":
      return "Failed";
    default:
      return "Uploaded";
  }
}
