/**
 * SSRF guards. Pure IP-classification helpers plus a hostname resolver check.
 *
 * Web Research mode fetches remote pages server-side, so it must refuse to
 * reach internal/network-local addresses even if an allowlisted (or redirected)
 * hostname resolves to one. We reject: loopback, link-local (incl. the cloud
 * metadata address 169.254.169.254), RFC1918 private ranges, unique-local IPv6,
 * and unspecified addresses.
 */
import { isIP } from "node:net";
import { promises as dns } from "node:dns";

/** Classify an IPv4 string as a blocked (non-public) address. */
export function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed -> treat as blocked
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast/reserved
  return false;
}

/** Classify an IPv6 string as a blocked (non-public) address. */
export function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // drop zone id
  if (addr === "::" || addr === "::1") return true; // unspecified / loopback
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local
  // IPv4-mapped (::ffff:a.b.c.d) -> validate the embedded IPv4.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

/** True when an IP literal is a blocked (internal/network-local) address. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIPv4(ip);
  if (v === 6) return isBlockedIPv6(ip);
  return true; // not an IP -> blocked
}

/**
 * Resolve a hostname and return true only if EVERY resolved address is a
 * public, routable IP. If the host is already an IP literal, classify it
 * directly. Any resolution failure is treated as blocked.
 */
export async function hostResolvesToPublicIp(host: string): Promise<boolean> {
  if (isIP(host)) return !isBlockedIp(host);
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return false;
  }
  if (addrs.length === 0) return false;
  return addrs.every((a) => !isBlockedIp(a.address));
}
