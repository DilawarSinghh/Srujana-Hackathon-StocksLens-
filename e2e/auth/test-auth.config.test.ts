import { describe, it, expect, afterEach } from "vitest";
import { isLocalSupabaseUrl, readTestAuthEnv } from "./test-auth.config";

/**
 * Unit tests for the production-target SAFETY GUARD. These run under `pnpm test`
 * (vitest), so the guard is protected against regressions without needing
 * Docker or a live Supabase.
 */

describe("isLocalSupabaseUrl", () => {
  it("accepts genuine local hosts", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://0.0.0.0:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://db.localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://LOCALHOST:54321")).toBe(true); // URL lowercases host
  });

  it("rejects hosted / production URLs", () => {
    expect(isLocalSupabaseUrl("https://iamdptauuhdrawdrnbza.supabase.co")).toBe(false);
    expect(isLocalSupabaseUrl("https://any-ref.supabase.co")).toBe(false);
  });

  it("cannot be bypassed by subdomain, path, or userinfo tricks", () => {
    expect(isLocalSupabaseUrl("http://localhost.attacker.com")).toBe(false);
    expect(isLocalSupabaseUrl("http://127.0.0.1.attacker.com")).toBe(false);
    expect(isLocalSupabaseUrl("http://attacker.com/127.0.0.1")).toBe(false);
    expect(isLocalSupabaseUrl("http://user@evil.com")).toBe(false);
    // userinfo that LOOKS local but the real host is evil.com:
    expect(isLocalSupabaseUrl("http://127.0.0.1@evil.com")).toBe(false);
  });

  it("rejects malformed input (fails closed)", () => {
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
    expect(isLocalSupabaseUrl("")).toBe(false);
    // IPv6 loopback is intentionally NOT allowlisted (Supabase local uses
    // 127.0.0.1); rejecting it is the safe, documented default.
    expect(isLocalSupabaseUrl("http://[::1]:54321")).toBe(false);
  });
});

describe("readTestAuthEnv", () => {
  const KEYS = [
    "E2E_SUPABASE_URL",
    "E2E_SUPABASE_ANON_KEY",
    "E2E_SUPABASE_SERVICE_ROLE",
    "E2E_TEST_EMAIL",
    "E2E_TEST_PASSWORD",
  ] as const;

  function setEnv(url: string) {
    process.env.E2E_SUPABASE_URL = url;
    process.env.E2E_SUPABASE_ANON_KEY = "anon";
    process.env.E2E_SUPABASE_SERVICE_ROLE = "service";
    process.env.E2E_TEST_EMAIL = "e2e-test@example.com";
    process.env.E2E_TEST_PASSWORD = "throwaway";
  }

  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("returns null when unconfigured (harness disabled by default)", () => {
    for (const k of KEYS) delete process.env[k];
    expect(readTestAuthEnv()).toBeNull();
  });

  it("returns null when only some vars are set (fails closed)", () => {
    process.env.E2E_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(readTestAuthEnv()).toBeNull();
  });

  it("parses a fully-configured LOCAL env", () => {
    setEnv("http://127.0.0.1:54321");
    const env = readTestAuthEnv();
    expect(env).not.toBeNull();
    expect(env?.url).toBe("http://127.0.0.1:54321");
    expect(env?.email).toBe("e2e-test@example.com");
  });

  it("THROWS (refuses) for a non-local URL, before any user/auth operation", () => {
    setEnv("https://iamdptauuhdrawdrnbza.supabase.co");
    expect(() => readTestAuthEnv()).toThrow(/REFUSING TO RUN/i);
  });
});
