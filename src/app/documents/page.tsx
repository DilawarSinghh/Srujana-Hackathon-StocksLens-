import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Disclaimer } from "@/components/disclaimer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My documents",
  description:
    "Upload a financial PDF to scan it for red flags and chat with it privately. Educational, not investment advice.",
};

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/documents");

  return (
    <div className="container flex max-w-3xl flex-col gap-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">My documents</h1>
        <p className="text-muted-foreground">
          Upload a financial PDF to get a neutral summary, an AI-assisted
          red-flag scan, and a private chat grounded in the document. Your files
          are visible only to you.
        </p>
        <Disclaimer />
      </header>

      <DocumentsPanel />
    </div>
  );
}
