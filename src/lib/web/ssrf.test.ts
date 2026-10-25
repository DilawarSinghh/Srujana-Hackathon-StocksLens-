import { describe, it, expect } from "vitest";
import { isBlockedIPv4, isBlockedIPv6, isBlockedIp } from "./ssrf";

describe("isBlockedIPv4", () => {
  it("blocks loopback, private, link-local and metadata addresses", () => {
    expect(isBlockedIPv4("127.0.0.1")).toBe(true);
    expect(isBlockedIPv4("10.0.0.5")).toBe(true);
    expect(isBlockedIPv4("172.16.4.4")).toBe(true);
    expect(isBlockedIPv4("172.31.255.255")).toBe(true);
    expect(isBlockedIPv4("192.168.1.1")).toBe(true);
    expect(isBlockedIPv4("169.254.169.254")).toBe(true); // cloud metadata
    expect(isBlockedIPv4("0.0.0.0")).toBe(true);
    expect(isBlockedIPv4("100.64.0.1")).toBe(true); // CGNAT
  });
  it("allows public addresses", () => {
    expect(isBlockedIPv4("8.8.8.8")).toBe(false);
    expect(isBlockedIPv4("1.1.1.1")).toBe(false);
    expect(isBlockedIPv4("172.15.0.1")).toBe(false);
    expect(isBlockedIPv4("172.32.0.1")).toBe(false);
  });
  it("blocks malformed input", () => {
    expect(isBlockedIPv4("999.1.1.1")).toBe(true);
    expect(isBlockedIPv4("abc")).toBe(true);
  });
});

describe("isBlockedIPv6", () => {
  it("blocks loopback, unspecified, link-local, unique-local", () => {
    expect(isBlockedIPv6("::1")).toBe(true);
    expect(isBlockedIPv6("::")).toBe(true);
    expect(isBlockedIPv6("fe80::1")).toBe(true);
    expect(isBlockedIPv6("fd00::1")).toBe(true);
  });
  it("blocks IPv4-mapped private addresses", () => {
    expect(isBlockedIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIPv6("::ffff:169.254.169.254")).toBe(true);
  });
  it("allows public IPv6", () => {
    expect(isBlockedIPv6("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isBlockedIp", () => {
  it("treats non-IP strings as blocked", () => {
    expect(isBlockedIp("example.com")).toBe(true);
  });
});
