import { describe, it, expect } from "vitest";
import { safeNextPath, DEFAULT_SIGNED_IN_PATH } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("defaults to the dashboard when no path is given", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath(undefined)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it("allows safe, same-origin internal paths", () => {
    expect(safeNextPath("/stocks")).toBe("/stocks");
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/portfolio#risk-lab")).toBe("/portfolio#risk-lab");
    expect(safeNextPath("/stocks/RELIANCE")).toBe("/stocks/RELIANCE");
  });

  it("rejects absolute external URLs", () => {
    expect(safeNextPath("https://evil.com")).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath("http://evil.com/path")).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it("rejects protocol-relative and backslash open-redirect vectors", () => {
    expect(safeNextPath("//evil.com")).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath("//evil.com/path")).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath("/\\evil.com")).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it("rejects paths that do not start with a slash", () => {
    expect(safeNextPath("evil.com")).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it("honors a custom fallback", () => {
    expect(safeNextPath(null, "/")).toBe("/");
    expect(safeNextPath("https://evil.com", "/")).toBe("/");
  });
});
