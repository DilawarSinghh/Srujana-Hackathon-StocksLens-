import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Disclaimer } from "@/components/disclaimer";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";

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
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="My documents"
        description="Upload a financial PDF to get a neutral summary, an AI-assisted red-flag scan, and a private chat grounded in the document. Your files are visible only to you."
      />
      <Disclaimer />
      <DocumentsPanel />
    </PageContainer>
  );
}
