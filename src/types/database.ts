/**
 * Database types for the FilingLens Postgres schema.
 *
 * Hand-maintained to match supabase/migrations. Composed from standalone
 * Row/Insert aliases (NO self-references through the `Database` interface) so
 * that @supabase/ssr's GenericSchema constraint resolves correctly. You can
 * regenerate with the Supabase CLI once a project exists:
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Numeric columns are `number | null`. Money values are INR crore.
 */

export type CapCategory = "large" | "mid" | "small";
export type AuditorOpinion =
  | "unqualified"
  | "qualified"
  | "adverse"
  | "disclaimer"
  | "unknown";
export type RelatedPartyTrend =
  | "stable"
  | "rising"
  | "sharply_rising"
  | "unknown";
export type ChatRole = "user" | "assistant";
export type AltmanZone = "safe" | "grey" | "distress" | "not_applicable";
export type DividendSafety = "strong" | "moderate" | "weak" | "not_available";
export type UserDocumentStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";
export type AuditStatus = "grounded" | "unverifiable" | "not_a_claim";

/** A single triggered red flag stored in scores.red_flags. */
export interface RedFlag {
  code: string;
  title: string;
  explanation: string;
  value: number | string | null;
}

/** Per-pillar plain-English explanation sentences. */
export interface ScoreExplanations {
  profitability?: string[];
  growth?: string[];
  financial_health?: string[];
  valuation?: string[];
  governance?: string[];
  stability?: string[];
  [pillar: string]: string[] | undefined;
}

/** One audited factual sentence from an assistant answer. */
export interface AuditClaim {
  sentence: string;
  status: AuditStatus;
}

/** Fact-audit result stored on an assistant chat message. */
export interface AuditResult {
  claims: AuditClaim[];
  groundedCount: number;
  unverifiableCount: number;
}

/** A single AI-assisted red flag found in a user-uploaded document. */
export interface DocumentRedFlag {
  title: string;
  explanation: string;
  page: number;
  short_quote: string;
}

/** A cited source attached to an assistant chat message. */
export interface ChatSource {
  id: string;
  doc: string;
  fiscalYear: number | null;
  page: number | null;
  section: string | null;
  snippet: string;
  url: string;
}

// ===========================================================================
// Row / Insert aliases (standalone — no circular references).
// ===========================================================================

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}
type ProfileInsert = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

type StockRow = {
  id: string;
  symbol: string;
  yahoo_symbol: string | null;
  exchange: string | null;
  name: string;
  sector: string | null;
  industry: string | null;
  cap_category: CapCategory | null;
  currency: string;
  country: string;
  is_active: boolean;
  created_at: string;
}
type StockInsert = {
  id?: string;
  symbol: string;
  yahoo_symbol?: string | null;
  exchange?: string | null;
  name: string;
  sector?: string | null;
  industry?: string | null;
  cap_category?: CapCategory | null;
  currency?: string;
  country?: string;
  is_active?: boolean;
  created_at?: string;
}

type PriceHistoryRow = {
  stock_id: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}
type PriceHistoryInsert = {
  stock_id: string;
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

type FundamentalsRow = {
  stock_id: string;
  fiscal_year: number;
  revenue: number | null;
  operating_profit: number | null;
  net_profit: number | null;
  total_debt: number | null;
  total_equity: number | null;
  total_assets: number | null;
  current_liabilities: number | null;
  operating_cash_flow: number | null;
  interest_expense: number | null;
  ebit: number | null;
  dividends_paid: number | null;
  shares_outstanding: number | null;
  current_assets: number | null;
  gross_profit: number | null;
  cost_of_revenue: number | null;
  retained_earnings: number | null;
  long_term_debt: number | null;
  total_liabilities: number | null;
}
type FundamentalsInsert = {
  stock_id: string;
  fiscal_year: number;
  revenue?: number | null;
  operating_profit?: number | null;
  net_profit?: number | null;
  total_debt?: number | null;
  total_equity?: number | null;
  total_assets?: number | null;
  current_liabilities?: number | null;
  operating_cash_flow?: number | null;
  interest_expense?: number | null;
  ebit?: number | null;
  dividends_paid?: number | null;
  shares_outstanding?: number | null;
  current_assets?: number | null;
  gross_profit?: number | null;
  cost_of_revenue?: number | null;
  retained_earnings?: number | null;
  long_term_debt?: number | null;
  total_liabilities?: number | null;
}

type StockMetricsRow = {
  stock_id: string;
  as_of: string | null;
  price: number | null;
  prev_close: number | null;
  market_cap: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roce: number | null;
  operating_margin: number | null;
  debt_to_equity: number | null;
  interest_coverage: number | null;
  dividend_yield: number | null;
  revenue_cagr_3y: number | null;
  revenue_cagr_5y: number | null;
  profit_cagr_3y: number | null;
  profit_cagr_5y: number | null;
  peg: number | null;
  volatility_1y: number | null;
  max_drawdown_3y: number | null;
  beta: number | null;
  week52_high: number | null;
  week52_low: number | null;
  piotroski_score: number | null;
  piotroski_available_criteria: number | null;
  altman_z: number | null;
  altman_zone: AltmanZone | null;
  dividend_payout_ratio: number | null;
  dividend_safety: DividendSafety | null;
}
type StockMetricsInsert = {
  stock_id: string;
  as_of?: string | null;
  price?: number | null;
  prev_close?: number | null;
  market_cap?: number | null;
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  roce?: number | null;
  operating_margin?: number | null;
  debt_to_equity?: number | null;
  interest_coverage?: number | null;
  dividend_yield?: number | null;
  revenue_cagr_3y?: number | null;
  revenue_cagr_5y?: number | null;
  profit_cagr_3y?: number | null;
  profit_cagr_5y?: number | null;
  peg?: number | null;
  volatility_1y?: number | null;
  max_drawdown_3y?: number | null;
  beta?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  piotroski_score?: number | null;
  piotroski_available_criteria?: number | null;
  altman_z?: number | null;
  altman_zone?: AltmanZone | null;
  dividend_payout_ratio?: number | null;
  dividend_safety?: DividendSafety | null;
}

type GovernanceRow = {
  stock_id: string;
  as_of: string;
  promoter_holding_pct: number | null;
  promoter_pledge_pct: number | null;
  promoter_holding_change_1y: number | null;
  fii_pct: number | null;
  dii_pct: number | null;
  public_pct: number | null;
  auditor_opinion: AuditorOpinion;
  related_party_trend: RelatedPartyTrend;
  source_note: string | null;
}
type GovernanceInsert = {
  stock_id: string;
  as_of: string;
  promoter_holding_pct?: number | null;
  promoter_pledge_pct?: number | null;
  promoter_holding_change_1y?: number | null;
  fii_pct?: number | null;
  dii_pct?: number | null;
  public_pct?: number | null;
  auditor_opinion?: AuditorOpinion;
  related_party_trend?: RelatedPartyTrend;
  source_note?: string | null;
}

type ScoreRow = {
  id: string;
  stock_id: string;
  computed_at: string;
  total_score: number | null;
  label: string | null;
  profitability: number | null;
  growth: number | null;
  financial_health: number | null;
  valuation: number | null;
  governance: number | null;
  stability: number | null;
  red_flags: RedFlag[];
  capped: boolean | null;
  data_confidence: number | null;
  sector_peer_count: number | null;
  explanations: ScoreExplanations | null;
  formula_version: string | null;
}
type ScoreInsert = {
  id?: string;
  stock_id: string;
  computed_at?: string;
  total_score?: number | null;
  label?: string | null;
  profitability?: number | null;
  growth?: number | null;
  financial_health?: number | null;
  valuation?: number | null;
  governance?: number | null;
  stability?: number | null;
  red_flags?: RedFlag[];
  capped?: boolean | null;
  data_confidence?: number | null;
  sector_peer_count?: number | null;
  explanations?: ScoreExplanations | null;
  formula_version?: string | null;
}

type FilingRow = {
  id: string;
  stock_id: string;
  doc_type: string | null;
  fiscal_year: number | null;
  title: string | null;
  source_url: string | null;
  storage_path: string | null;
  content_hash: string;
  created_at: string;
}
type FilingInsert = {
  id?: string;
  stock_id: string;
  doc_type?: string | null;
  fiscal_year?: number | null;
  title?: string | null;
  source_url?: string | null;
  storage_path?: string | null;
  content_hash: string;
  created_at?: string;
}

type FilingChunkRow = {
  id: string;
  filing_id: string;
  stock_id: string;
  page_number: number | null;
  section: string | null;
  content: string | null;
  has_table: boolean | null;
  token_count: number | null;
  embedding: string | null;
}
type FilingChunkInsert = {
  id?: string;
  filing_id: string;
  stock_id: string;
  page_number?: number | null;
  section?: string | null;
  content?: string | null;
  has_table?: boolean | null;
  token_count?: number | null;
  embedding?: string | number[] | null;
}

type PortfolioRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}
type PortfolioInsert = {
  id?: string;
  user_id: string;
  name?: string;
  created_at?: string;
}

type HoldingRow = {
  id: string;
  portfolio_id: string;
  stock_id: string;
  quantity: number;
  avg_buy_price: number;
  created_at: string;
}
type HoldingInsert = {
  id?: string;
  portfolio_id: string;
  stock_id: string;
  quantity: number;
  avg_buy_price: number;
  created_at?: string;
}

type ChatMessageRow = {
  id: string;
  user_id: string;
  stock_id: string;
  role: ChatRole;
  content: string;
  sources: ChatSource[] | null;
  audit: AuditResult | null;
  created_at: string;
}
type ChatMessageInsert = {
  id?: string;
  user_id: string;
  stock_id: string;
  role: ChatRole;
  content: string;
  sources?: ChatSource[] | null;
  audit?: AuditResult | null;
  created_at?: string;
}

type UserDocumentRow = {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  page_count: number | null;
  status: UserDocumentStatus;
  red_flags: DocumentRedFlag[] | null;
  summary: string | null;
  created_at: string;
}
type UserDocumentInsert = {
  id?: string;
  user_id: string;
  filename: string;
  storage_path: string;
  page_count?: number | null;
  status?: UserDocumentStatus;
  red_flags?: DocumentRedFlag[] | null;
  summary?: string | null;
  created_at?: string;
}

type UserDocumentChunkRow = {
  id: string;
  document_id: string;
  user_id: string;
  page_number: number | null;
  section: string | null;
  content: string | null;
  embedding: string | null;
}
type UserDocumentChunkInsert = {
  id?: string;
  document_id: string;
  user_id: string;
  page_number?: number | null;
  section?: string | null;
  content?: string | null;
  embedding?: string | number[] | null;
}

// ===========================================================================
// Database schema
// ===========================================================================

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: ProfileInsert; Update: Partial<ProfileInsert>; Relationships: [] };
      stocks: { Row: StockRow; Insert: StockInsert; Update: Partial<StockInsert>; Relationships: [] };
      price_history: { Row: PriceHistoryRow; Insert: PriceHistoryInsert; Update: Partial<PriceHistoryInsert>; Relationships: [] };
      fundamentals_annual: { Row: FundamentalsRow; Insert: FundamentalsInsert; Update: Partial<FundamentalsInsert>; Relationships: [] };
      stock_metrics: { Row: StockMetricsRow; Insert: StockMetricsInsert; Update: Partial<StockMetricsInsert>; Relationships: [] };
      governance_inputs: { Row: GovernanceRow; Insert: GovernanceInsert; Update: Partial<GovernanceInsert>; Relationships: [] };
      scores: { Row: ScoreRow; Insert: ScoreInsert; Update: Partial<ScoreInsert>; Relationships: [] };
      filings: { Row: FilingRow; Insert: FilingInsert; Update: Partial<FilingInsert>; Relationships: [] };
      filing_chunks: { Row: FilingChunkRow; Insert: FilingChunkInsert; Update: Partial<FilingChunkInsert>; Relationships: [] };
      portfolios: { Row: PortfolioRow; Insert: PortfolioInsert; Update: Partial<PortfolioInsert>; Relationships: [] };
      holdings: { Row: HoldingRow; Insert: HoldingInsert; Update: Partial<HoldingInsert>; Relationships: [] };
      chat_messages: { Row: ChatMessageRow; Insert: ChatMessageInsert; Update: Partial<ChatMessageInsert>; Relationships: [] };
      user_documents: { Row: UserDocumentRow; Insert: UserDocumentInsert; Update: Partial<UserDocumentInsert>; Relationships: [] };
      user_document_chunks: { Row: UserDocumentChunkRow; Insert: UserDocumentChunkInsert; Update: Partial<UserDocumentChunkInsert>; Relationships: [] };
    };
    Views: {
      latest_scores: { Row: ScoreRow; Relationships: [] };
    };
    Functions: {
      match_filing_chunks: {
        Args: {
          query_embedding: string | number[];
          match_stock_id: string;
          match_count?: number;
        };
        Returns: {
          id: string;
          filing_id: string;
          page_number: number | null;
          section: string | null;
          content: string | null;
          similarity: number;
        }[];
      };
      match_user_document_chunks: {
        Args: {
          query_embedding: string | number[];
          match_document_id: string;
          match_count?: number;
        };
        Returns: {
          id: string;
          document_id: string;
          page_number: number | null;
          section: string | null;
          content: string | null;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row-type helpers. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
