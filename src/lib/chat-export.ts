import type { ChatMessage } from "@/components/chat/use-chat-stream";
import { DISCLAIMER_LINE } from "@/lib/rag/guardrails";

/**
 * Build a Markdown transcript of a chat conversation: each message with its
 * role, assistant citations (with page numbers), and a closing disclaimer.
 * Pure string builder — no DOM — so it is easy to test.
 */
export function buildChatMarkdown(
  title: string,
  messages: ChatMessage[],
): string {
  const lines: string[] = [`# Chat — ${title}`, ""];

  for (const m of messages) {
    const who = m.role === "user" ? "You" : "Assistant";
    lines.push(`## ${who}`, "", m.content.trim(), "");

    if (m.role === "assistant" && m.sources && m.sources.length > 0) {
      lines.push("Sources:");
      for (const s of m.sources) {
        const page = s.page != null ? `, p. ${s.page}` : "";
        const fy = s.fiscalYear != null ? ` FY${s.fiscalYear}` : "";
        lines.push(`- [${s.id}] ${s.doc}${fy}${page}`);
      }
      lines.push("");
    }
  }

  lines.push("---", "", DISCLAIMER_LINE, "");
  return lines.join("\n");
}

/** Trigger a client-side download of the conversation as a .md file. */
export function exportChatMarkdown(
  title: string,
  messages: ChatMessage[],
  filename: string,
): void {
  const md = buildChatMarkdown(title, messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
