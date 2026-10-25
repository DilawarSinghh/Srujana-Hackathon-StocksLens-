"use client";

import * as React from "react";
import type { ChatSource, AuditResult } from "@/types/database";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  audit?: AuditResult | null;
}

type ErrorKind = "auth" | "rate" | "generic" | null;

interface SendResult {
  ok: boolean;
}

/**
 * Minimal chat stream hook against /api/chat.
 * Parses the Vercel AI data-stream text parts (lines like `0:"token"`).
 * Loads/clears history via /api/chat/history.
 */
export type ChatMode = "analysis" | "filings";

export function useChatStream(symbol: string, mode: ChatMode = "analysis") {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<ErrorKind>(null);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const lastUserMessage = React.useRef<string>("");

  const loadHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/chat/history?symbol=${encodeURIComponent(symbol)}&mode=${mode}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMessages(data.messages ?? []);
      }
    } catch {
      // ignore; empty state is fine
    } finally {
      setLoadingHistory(false);
    }
  }, [symbol, mode]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const clear = React.useCallback(async () => {
    await fetch(
      `/api/chat/history?symbol=${encodeURIComponent(symbol)}&mode=${mode}`,
      { method: "DELETE" },
    );
    setMessages([]);
    setError(null);
  }, [symbol, mode]);

  const send = React.useCallback(
    async (message: string): Promise<SendResult> => {
      if (streaming || message.trim().length === 0) return { ok: false };
      setError(null);
      lastUserMessage.current = message;

      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Optimistically add the user message + an empty assistant bubble.
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: message,
      };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, message, mode, history }),
        });

        if (!res.ok) {
          const kind: ErrorKind =
            res.status === 401 ? "auth" : res.status === 429 ? "rate" : "generic";
          setError(kind);
          // Remove the optimistic pair on error.
          setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
          return { ok: false };
        }

        await readDataStream(res, (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
        });

        // Refresh from DB so the assistant message carries persisted sources
        // (and the guarded/final copy).
        await loadHistory();
        return { ok: true };
      } catch {
        setError("generic");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return { ok: false };
      } finally {
        setStreaming(false);
      }
    },
    [streaming, messages, symbol, mode, loadHistory],
  );

  const retry = React.useCallback(() => {
    if (lastUserMessage.current) void send(lastUserMessage.current);
  }, [send]);

  return {
    messages,
    streaming,
    error,
    loadingHistory,
    send,
    clear,
    retry,
  };
}

/** Read the AI data-stream and emit decoded text tokens. */
async function readDataStream(
  res: Response,
  onText: (text: string) => void,
): Promise<void> {
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

/** Parse one data-stream line. Text parts look like `0:"..."`. */
function parseLine(line: string, onText: (text: string) => void) {
  const idx = line.indexOf(":");
  if (idx === -1) return;
  const type = line.slice(0, idx);
  const rest = line.slice(idx + 1);
  if (type === "0") {
    try {
      const text = JSON.parse(rest) as string;
      onText(text);
    } catch {
      // ignore malformed partial line
    }
  }
  // Other part types (data, error, finish) are ignored for rendering.
}
