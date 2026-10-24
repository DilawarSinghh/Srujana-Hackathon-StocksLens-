/**
 * Database types for the FilingLens Postgres schema.
 *
 * Hand-maintained to match supabase/migrations. You can regenerate with the
 * Supabase CLI once a project exists:
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Numeric columns are represented as `number | null`. Money values are INR crore.
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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      stocks: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: Partial<Database["public"]["Tables"]["stocks"]["Insert"]>;
        Relationships: [];
      };
      price_history: {
        Row: {
          stock_id: string;
          date: string;
          open: number | null;
          high: number | null;
          low: number | null;
          close: number | null;
          volume: number | null;
        };
        Insert: {
          stock_id: string;
          date: string;
          open?: number | null;
          high?: number | null;
          low?: number | null;
          close?: number | null;
          volume?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["price_history"]["Insert"]
        >;
        Relationships: [];
      };
      fundamentals_annual: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: Partial<
          Database["public"]["Tables"]["fundamentals_annual"]["Insert"]
        >;
        Relationships: [];
      };
      stock_metrics: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: Partial<
          Database["public"]["Tables"]["stock_metrics"]["Insert"]
        >;
        Relationships: [];
      };
      governance_inputs: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: Partial<
          Database["public"]["Tables"]["governance_inputs"]["Insert"]
        >;
        Relationships: [];
      };
      scores: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: Partial<Database["public"]["Tables"]["scores"]["Insert"]>;
        Relationships: [];
      };
      filings: {
        Row: {
          id: string;
          stock_id: string;
          doc_type: string | null;
          fiscal_year: number | null;
          title: string | null;
          source_url: string | null;
          storage_path: string | null;
          content_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          stock_id: string;
          doc_type?: string | null;
          fiscal_year?: number | null;
          title?: string | null;
          source_url?: string | null;
          storage_path?: string | null;
          content_hash: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["filings"]["Insert"]>;
        Relationships: [];
      };
      filing_chunks: {
        Row: {
          id: string;
          filing_id: string;
          stock_id: string;
          page_number: number | null;
          section: string | null;
          content: string | null;
          has_table: boolean | null;
          token_count: number | null;
          embedding: string | null;
        };
        Insert: {
          id?: string;
          filing_id: string;
          stock_id: string;
          page_number?: number | null;
          section?: string | null;
          content?: string | null;
          has_table?: boolean | null;
          token_count?: number | null;
          embedding?: string | number[] | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["filing_chunks"]["Insert"]
        >;
        Relationships: [];
      };
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolios"]["Insert"]>;
        Relationships: [];
      };
      holdings: {
        Row: {
          id: string;
          portfolio_id: string;
          stock_id: string;
          quantity: number;
          avg_buy_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          stock_id: string;
          quantity: number;
          avg_buy_price: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["holdings"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          stock_id: string;
          role: ChatRole;
          content: string;
          sources: ChatSource[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stock_id: string;
          role: ChatRole;
          content: string;
          sources?: ChatSource[] | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["chat_messages"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: {
      latest_scores: {
        Row: Database["public"]["Tables"]["scores"]["Row"];
        Relationships: [];
      };
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
