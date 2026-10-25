-- =============================================================================
-- 0012_chat_analysis_mode.sql
-- Add 'analysis' to the chat_messages.mode discriminator. "Stock Analysis" is
-- the new default chat experience: it answers from the app's structured market
-- and fundamental DATA (plus optional filing excerpts) and is useful even when
-- no filings are indexed. Its transcript is stored separately from the
-- document-grounded 'filings' chat.
-- Additive only; RLS already covers chat_messages (owner-only, migration 0005).
-- =============================================================================

alter table public.chat_messages
  drop constraint if exists chat_messages_mode_check;

alter table public.chat_messages
  add constraint chat_messages_mode_check
    check (mode in ('analysis', 'filings', 'web', 'portfolio'));

comment on column public.chat_messages.mode is
  'Which assistant mode produced this message: analysis | filings | web | portfolio.';
