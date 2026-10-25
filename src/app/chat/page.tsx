import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSearchEnabled } from "@/lib/web/search";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";
import { Disclaimer } from "@/components/disclaimer";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Chat",
  description:
    "Chat with StockLens AI about any supported company — grounded in its fundamentals, score, and filings. Educational, not investment advice.",
};

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/chat");

  const webEnabled = isSearchEnabled();

  return (
    <PageContainer>
      <PageHeader
        title="AI Chat"
        description="Pick a company and ask grounded questions about its fundamentals, score, risks, and filings."
      />
      <Disclaimer />
      <ChatWorkspace webEnabled={webEnabled} />
    </PageContainer>
  );
}
