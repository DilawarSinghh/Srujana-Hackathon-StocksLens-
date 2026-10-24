-- =============================================================================
-- 0006_storage_filings_bucket.sql
-- Public "filings" Storage bucket for source PDFs.
--
-- Uploads happen via the service role key (ingestion script), which bypasses
-- RLS. Public read lets the UI link to a PDF page. No client writes.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('filings', 'filings', true)
on conflict (id) do update set public = true;

-- Public read of objects in the filings bucket.
drop policy if exists "public read filings bucket" on storage.objects;
create policy "public read filings bucket"
  on storage.objects for select
  using (bucket_id = 'filings');
