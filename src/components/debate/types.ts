import type { ChatDataBlock } from "@/lib/rag/context";
import type { DebateResult } from "@/lib/debate/schema";

/** Citation metadata returned alongside the debate (filing-backed only). */
export interface DebateCitation {
  id: string;
  doc: string;
  fiscalYear: number | null;
  page: number | null;
  section: string | null;
  snippet: string;
  url: string;
}

export interface DebateStock {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  as_of: string | null;
}

/** Full response shape from POST /api/debate. */
export interface DebateResponse {
  runId: string;
  stock: DebateStock;
  snapshot: ChatDataBlock;
  citations: DebateCitation[];
  debate: DebateResult;
}
