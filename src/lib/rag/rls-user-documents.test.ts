import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * RLS integration test for user_documents / user_document_chunks.
 *
 * This hits a REAL Supabase project, so it is OPT-IN only: it runs when
 * RUN_RLS_TESTS=1 and two test-user JWTs are provided. It is skipped otherwise
 * (e.g. in normal `pnpm test`) so the suite never touches a live database by
 * accident. The assertions prove user A cannot read user B's documents/chunks.
 *
 * Required env when enabled:
 *   RUN_RLS_TESTS=1
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   TEST_USER_A_JWT, TEST_USER_B_JWT  (access tokens for two distinct users)
 *   TEST_USER_B_DOC_ID                (a document id owned by user B)
 */
const enabled =
  process.env.RUN_RLS_TESTS === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.TEST_USER_A_JWT &&
  !!process.env.TEST_USER_B_JWT &&
  !!process.env.TEST_USER_B_DOC_ID;

const d = enabled ? describe : describe.skip;

d("RLS: user_documents / user_document_chunks ownership", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const docB = process.env.TEST_USER_B_DOC_ID!;

  const asUser = (jwt: string) =>
    createClient<Database>(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

  it("user A cannot read user B's document row", async () => {
    const a = asUser(process.env.TEST_USER_A_JWT!);
    const { data } = await a
      .from("user_documents")
      .select("id")
      .eq("id", docB);
    expect(data ?? []).toHaveLength(0);
  });

  it("user A cannot read user B's chunks", async () => {
    const a = asUser(process.env.TEST_USER_A_JWT!);
    const { data } = await a
      .from("user_document_chunks")
      .select("id")
      .eq("document_id", docB);
    expect(data ?? []).toHaveLength(0);
  });

  it("user B can read their own document", async () => {
    const b = asUser(process.env.TEST_USER_B_JWT!);
    const { data } = await b
      .from("user_documents")
      .select("id")
      .eq("id", docB);
    expect(data ?? []).toHaveLength(1);
  });
});
