-- =============================================================================
-- 0011_chat_mode.sql
-- Add a `mode` discriminator to chat_messages so the filings chat, web research
-- chat, and portfolio explainer transcripts can be stored and queried
-- separately. Existing rows default to 'filings' (backward compatible).
-- Additive only; RLS already covers chat_messages (owner-only, migration 0005).
-- =============================================================================

alter table public.chat_messages
  add column if not exists mode text not null default 'filings'
    check (mode in ('filings', 'web', 'portfolio'));

comment on column public.chat_messages.mode is
  'Which assistant mode produced this message: filings | web | portfolio.';

-- History queries filter by (user_id, stock_id, mode); extend the existing
-- composite index to include mode for efficient per-mode lookups.
create index if not exists chat_messages_user_stock_mode_created_idx
  on public.chat_messages (user_id, stock_id, mode, created_at);
