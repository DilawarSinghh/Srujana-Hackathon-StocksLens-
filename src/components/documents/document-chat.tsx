"use client";

import * as React from "react";
import { Send, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportChatMarkdown } from "@/lib/chat-export";
import type { ChatMessage } from "@/components/chat/use-chat-stream";

const MAX_CHARS = 1000;

/**
 * Chat with a single uploaded document. Streams from
 * /api/documents/[id]/chat. The answer is grounded only in this document's
 * chunks and runs through the same guards as stock chat.
 */
export function DocumentChat({
  documentId,
  filename,
}: {
  documentId: string;
  filename: string;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Reset the conversation when switching documents.
    setMessages([]);
    setError(null);
  }, [documentId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setStreaming(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in." : "Something went wrong.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
        return;
      }
      await readDataStream(res, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m,
          ),
        );
      });
    } catch {
      setError("Something went wrong.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <Card className="flex max-h-[32rem] flex-col">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between">
        <CardTitle className="text-base">Chat with this document</CardTitle>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              exportChatMarkdown(
                filename,
                messages,
                `chat-${filename.replace(/\.pdf$/i, "")}-${new Date().toISOString().slice(0, 10)}.md`,
              )
            }
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label="Export chat as Markdown"
          >
            <Download className="h-3 w-3" /> Export
          </button>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div ref={scrollRef} className="min-h-24 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ask a question about this document. Answers come only from its text.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm"
                  }
                >
                  {m.role === "assistant" && !m.content ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-label="Thinking" />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-weak">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={streaming}
            rows={2}
            placeholder="Ask about this document…"
            aria-label="Message"
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <Button
            size="icon"
            onClick={() => void send()}
            disabled={streaming || input.trim().length === 0}
            aria-label="Send"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Educational analysis from your document, not investment advice.
        </p>
      </CardContent>
    </Card>
  );
}

/** Read the Vercel AI data-stream and emit decoded text tokens. */
async function readDataStream(res: Response, onText: (t: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("0:")) {
        try {
          onText(JSON.parse(line.slice(2)) as string);
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (buffer.startsWith("0:")) {
    try {
      onText(JSON.parse(buffer.slice(2)) as string);
    } catch {
      /* ignore */
    }
  }
}
