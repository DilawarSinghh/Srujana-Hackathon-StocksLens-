import { describe, it, expect } from "vitest";
import { buildChatMarkdown } from "./chat-export";
import { DISCLAIMER_LINE } from "@/lib/rag/guardrails";
import type { ChatMessage } from "@/components/chat/use-chat-stream";

const messages: ChatMessage[] = [
  { id: "u1", role: "user", content: "What are the key risks?" },
  {
    id: "a1",
    role: "assistant",
    content: "Debt rose this year [S1].",
    sources: [
      {
        id: "S1",
        doc: "Annual Report",
        fiscalYear: 2024,
        page: 47,
        section: "Risk Factors",
        snippet: "…",
        url: "",
      },
    ],
  },
];

describe("buildChatMarkdown", () => {
  it("includes the title, both roles, and the content", () => {
    const md = buildChatMarkdown("Acme (ACME)", messages);
    expect(md).toContain("# Chat — Acme (ACME)");
    expect(md).toContain("## You");
    expect(md).toContain("## Assistant");
    expect(md).toContain("What are the key risks?");
    expect(md).toContain("Debt rose this year [S1].");
  });

  it("lists assistant citations with page numbers", () => {
    const md = buildChatMarkdown("Acme (ACME)", messages);
    expect(md).toContain("- [S1] Annual Report FY2024, p. 47");
  });

  it("ends with the disclaimer line", () => {
    const md = buildChatMarkdown("Acme (ACME)", messages);
    expect(md.trimEnd().endsWith(DISCLAIMER_LINE)).toBe(true);
  });

  it("omits a sources block when there are no sources", () => {
    const md = buildChatMarkdown("Acme (ACME)", [messages[0]]);
    expect(md).not.toContain("Sources:");
  });
});
