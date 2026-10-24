/**
 * Ingest filing PDFs into Supabase (chunk, embed, store).
 *
 *   pnpm ingest
 *
 * Input layout: data/filings/<SYMBOL>/<doc_type>_<FY>.pdf
 *   e.g. data/filings/TCS/annual_report_2025.pdf
 *
 * Idempotent: a file whose sha256 already exists in `filings` is skipped.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { db } from "./lib/db";
import { extractPdfPages } from "./lib/pdf";
import {
  chunkPages,
  buildEmbedText,
  type Page,
} from "@/lib/rag/chunking";
import { embedBatch } from "@/lib/rag/embeddings";
import type { TablesInsert } from "@/types/database";

const FILINGS_DIR = "data/filings";
const BUCKET = "filings";

interface ParsedFile {
  symbol: string;
  docType: string;
  fiscalYear: number;
  filePath: string;
  fileName: string;
}

/** Parse <doc_type>_<FY>.pdf — doc_type may contain underscores. */
function parseFileName(symbol: string, fileName: string): ParsedFile | null {
  if (!fileName.toLowerCase().endsWith(".pdf")) return null;
  const base = fileName.slice(0, -4);
  const m = base.match(/^(.*)_(\d{4})$/);
  if (!m) return null;
  return {
    symbol,
    docType: m[1],
    fiscalYear: Number(m[2]),
    filePath: path.join(FILINGS_DIR, symbol, fileName),
    fileName,
  };
}

function discoverFiles(): ParsedFile[] {
  if (!existsSync(FILINGS_DIR)) return [];
  const out: ParsedFile[] = [];
  for (const symbol of readdirSync(FILINGS_DIR)) {
    const dir = path.join(FILINGS_DIR, symbol);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      const parsed = parseFileName(symbol, file);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function prettyDocType(docType: string): string {
  return docType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function ingestOne(file: ParsedFile): Promise<void> {
  const { symbol, docType, fiscalYear, filePath, fileName } = file;
  const label = `${symbol}/${fileName}`;

  // Resolve stock.
  const { data: stock } = await db
    .from("stocks")
    .select("id, name")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  if (!stock) {
    console.warn(`! ${label}: unknown symbol — skipped.`);
    return;
  }

  const buf = readFileSync(filePath);
  const hash = sha256(buf);

  // Idempotency: skip if this content is already ingested.
  const { data: existing } = await db
    .from("filings")
    .select("id")
    .eq("content_hash", hash)
    .maybeSingle();
  if (existing) {
    console.log(`• ${label}: already ingested (hash match) — skipped.`);
    return;
  }

  // Extract pages.
  const { pages, warnings } = await extractPdfPages(new Uint8Array(buf));
  const pageInputs: Page[] = pages
    .filter((p) => !p.nearEmpty)
    .map((p) => ({ pageNumber: p.pageNumber, text: p.text }));

  const chunks = chunkPages(pageInputs);
  if (chunks.length === 0) {
    console.warn(`! ${label}: no extractable text (scanned?) — skipped.`);
    return;
  }

  // Embed: header + content; store clean content only.
  const embedTexts = chunks.map((c) =>
    buildEmbedText({
      company: stock.name,
      docType,
      fiscalYear,
      section: c.section,
      pageNumber: c.pageNumber,
      content: c.content,
    }),
  );
  const embeddings = await embedBatch(embedTexts, 50);

  // Upload PDF to public Storage bucket.
  const storagePath = `${symbol.toUpperCase()}/${fileName}`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  const sourceUrl = pub.publicUrl;

  // Insert filing.
  const title = `${prettyDocType(docType)} FY${fiscalYear}`;
  const filingInsert: TablesInsert<"filings"> = {
    stock_id: stock.id,
    doc_type: docType,
    fiscal_year: fiscalYear,
    title,
    source_url: sourceUrl,
    storage_path: storagePath,
    content_hash: hash,
  };
  const { data: filing, error: fErr } = await db
    .from("filings")
    .insert(filingInsert)
    .select("id")
    .single();
  if (fErr || !filing) throw new Error(`filing insert: ${fErr?.message}`);

  // Insert chunks (batched).
  const chunkRows: TablesInsert<"filing_chunks">[] = chunks.map((c, i) => ({
    filing_id: filing.id,
    stock_id: stock.id,
    page_number: c.pageNumber,
    section: c.section,
    content: c.content,
    has_table: c.hasTable,
    token_count: c.tokenCount,
    embedding: embeddings[i],
  }));

  const CHUNK = 200;
  for (let i = 0; i < chunkRows.length; i += CHUNK) {
    const { error: cErr } = await db
      .from("filing_chunks")
      .insert(chunkRows.slice(i, i + CHUNK));
    if (cErr) throw new Error(`chunk insert: ${cErr.message}`);
  }

  console.log(
    `✓ ${label}: ${pages.length} pages, ${chunks.length} chunks, ${warnings.length} warnings`,
  );
  for (const w of warnings.slice(0, 5)) console.log(`    ⚠ ${w}`);
  if (warnings.length > 5) console.log(`    … ${warnings.length - 5} more warnings`);
}

async function main() {
  const files = discoverFiles();
  if (files.length === 0) {
    console.log(
      `No PDFs found under ${FILINGS_DIR}/<SYMBOL>/<doc_type>_<FY>.pdf`,
    );
    return;
  }

  console.log(`Found ${files.length} filing(s).\n`);
  for (const file of files) {
    try {
      await ingestOne(file);
    } catch (e) {
      console.error(`✗ ${file.symbol}/${file.fileName}: ${(e as Error).message}`);
    }
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
