"use client";

import * as React from "react";
import type { ChatSource } from "@/types/database";
import type { ChatMessage } from "@/components/chat/use-chat-stream";

type ErrorKind = "auth" | "rate" | "disabled" | "generic" | null;

/**
 * Web Research chat stream hook against /api/research. Mirrors useChatStream but
 * targets the web mode: history is loaded/cleared with mode=web, and the
 * request body is { symbol, question } (no client-supplied history — web mode
 * is single-turn per question).
 */
export function useResearchStream(symbol: string) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<ErrorKind>(null);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const lastQuestion = React.useRef<string>("");

  const loadHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/chat/history?symbol=${encodeURIComponent(symbol)}&mode=web`,
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
  }, [symbol]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const clear = React.useCallback(async () => {
    await fetch(`/api/chat/history?symbol=${encodeURIComponent(symbol)}&mode=web`, {
      method: "DELETE",
    });
    setMessages([]);
    setError(null);
  }, [symbol]);

  const send = React.useCallback(
    async (question: string): Promise<void> => {
      if (streaming || question.trim().length === 0) return;
      setError(null);
      lastQuestion.current = question;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: question,
      };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setStreaming(true);

      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, question }),
        });

        if (!res.ok) {
          const kind: ErrorKind =
            res.status === 401
              ? "auth"
              : res.status === 429
                ? "rate"
                : res.status === 503
                  ? "disabled"
                  : "generic";
          setError(kind);
          setMessages((prev) =>
            prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id),
          );
          return;
        }

        await readDataStream(res, (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
        });

        // Refresh from DB so the assistant message carries persisted sources.
        await loadHistory();
      } catch {
        setError("generic");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
      }
    },
    [streaming, symbol, loadHistory],
  );

  const retry = React.useCallback(() => {
    if (lastQuestion.current) void send(lastQuestion.current);
  }, [send]);

  return { messages, streaming, error, loadingHistory, send, clear, retry };
}

export type { ChatSource };

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

function parseLine(line: string, onText: (text: string) => void) {
  const idx = line.indexOf(":");
  if (idx === -1) return;
  const type = line.slice(0, idx);
  const rest = line.slice(idx + 1);
  if (type === "0") {
    try {
      onText(JSON.parse(rest) as string);
    } catch {
      // ignore malformed partial line
    }
  }
}
