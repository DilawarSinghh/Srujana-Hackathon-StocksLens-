"use client";

import * as React from "react";
import { Send, Loader2, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MAX_CHARS = 1000;

const EXAMPLE_QUESTIONS = [
  "Challenge the Bull's valuation argument.",
  "Which missing metrics most limit this verdict?",
  "What evidence would make the bearish case stronger?",
  "Compare the company's growth with its debt levels.",
  "What would invalidate the current thesis?",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface FollowupChatProps {
  symbol: string;
  /** Bounded debate summary passed as context (not the full debate). */
  context: string;
  disabled?: boolean;
}

/** Context-aware follow-up chat streamed from /api/debate/followup. */
export function FollowupChat({ symbol, context, disabled }: FollowupChatProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const send = React.useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      setError(null);

      const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: message };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setStreaming(true);

      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/debate/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, message, context, history }),
        });
        if (!res.ok) {
          setError(
            res.status === 401
              ? "Please sign in to continue."
              : res.status === 429
                ? "You've hit the hourly AI limit. Try again later."
                : "Something went wrong. Please try again.",
          );
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
        setError("Something went wrong. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
      }
    },
    [streaming, messages, symbol, context],
  );

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    await send(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessagesSquare className="h-4 w-4" aria-hidden="true" />
          Continue the debate
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          ref={scrollRef}
          className="max-h-80 flex-1 overflow-y-auto"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Ask a follow-up grounded in this debate and the available data:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={disabled || streaming}
                    onClick={() => void send(q)}
                    className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {m.content || (
                      <Loader2 className="h-4 w-4 animate-spin" aria-label="Thinking" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-end gap-2 border-t border-border pt-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={onKeyDown}
            disabled={disabled || streaming}
            rows={2}
            placeholder="Challenge a claim, or ask an agent to elaborate…"
            aria-label="Follow-up question"
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={disabled || streaming || input.trim().length === 0}
            aria-label="Send follow-up"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Educational research, not personalised investment advice.
        </p>
      </CardContent>
    </Card>
  );
}

/** Read the Vercel AI data-stream and emit decoded text tokens. */
async function readDataStream(res: Response, onText: (text: string) => void): Promise<void> {
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
      parseLine(line, onText);
    }
  }
  if (buffer.trim()) parseLine(buffer, onText);
}

function parseLine(line: string, onText: (text: string) => void) {
  const idx = line.indexOf(":");
  if (idx === -1) return;
  if (line.slice(0, idx) === "0") {
    try {
      onText(JSON.parse(line.slice(idx + 1)) as string);
    } catch {
      // ignore malformed partial line
    }
  }
}
