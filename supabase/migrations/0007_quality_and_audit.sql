-- =============================================================================
-- 0007_quality_and_audit.sql
-- Additive columns for financial-quality scoring (Piotroski, Altman, dividend)
-- and a fact-audit column on chat messages.
--
-- Additive only. Never edits prior migrations. All new columns are nullable;
-- NULL = not available (never a default/invented value).
-- =============================================================================

-- --- fundamentals_annual: extra balance-sheet / income-statement fields -------
-- dividends_paid already exists (0002); do not re-add it.
alter table public.fundamentals_annual
  add column if not exists current_assets     numeric,
  add column if not exists gross_profit       numeric,
  add column if not exists cost_of_revenue    numeric,
  add column if not exists retained_earnings  numeric,
  add column if not exists long_term_debt     numeric,
  add column if not exists total_liabilities  numeric;

-- --- stock_metrics: code-computed quality scores ------------------------------
alter table public.stock_metrics
  add column if not exists piotroski_score             int,
  add column if not exists piotroski_available_criteria int,
  add column if not exists altman_z                    numeric,
  add column if not exists altman_zone                 text
    check (altman_zone in ('safe', 'grey', 'distress', 'not_applicable')),
  add column if not exists dividend_payout_ratio       numeric,
  add column if not exists dividend_safety             text
    check (dividend_safety in ('strong', 'moderate', 'weak', 'not_available'));

comment on column public.stock_metrics.piotroski_score is
  'Piotroski F-Score (0-9), code-computed. NULL when fewer than 6 criteria are available or sector is a bank/NBFC.';
comment on column public.stock_metrics.altman_z is
  'Altman Z''-Score (emerging-market variant), code-computed. NULL if any input missing.';

-- --- chat_messages: per-answer fact audit -------------------------------------
alter table public.chat_messages
  add column if not exists audit jsonb;

comment on column public.chat_messages.audit is
  'Fact-audit result for an assistant answer: { claims:[{sentence,status}], groundedCount, unverifiableCount }. NULL when audit did not run.';
