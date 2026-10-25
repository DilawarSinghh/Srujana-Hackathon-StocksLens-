/**
 * DOMAIN ALLOWLIST for Web Research mode (editable).
 *
 * Only pages on these domains are fetched and fed to the model. Results from
 * any other domain are shown to the user ONLY as unverified links and are never
 * read or passed to the LLM. Keep this list conservative: official Indian
 * market/regulatory sources plus a short list of reputable financial media.
 *
 * Matching is host-suffix based, so "nseindia.com" also allows
 * "www.nseindia.com" and "archives.nseindia.com".
 */

/** Official exchanges, regulators and government portals. */
export const OFFICIAL_DOMAINS: readonly string[] = [
  "bseindia.com",
  "nseindia.com",
  "sebi.gov.in",
  "rbi.gov.in",
  "incometax.gov.in",
  "mca.gov.in",
];

/** Reputable financial news / data sites. */
export const FINANCIAL_MEDIA_DOMAINS: readonly string[] = [
  "reuters.com",
  "economictimes.indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "moneycontrol.com",
  "screener.in",
];

/** The base allowlist (official + media), excluding any per-stock IR domain. */
export const BASE_ALLOWLIST: readonly string[] = [
  ...OFFICIAL_DOMAINS,
  ...FINANCIAL_MEDIA_DOMAINS,
];

/** Normalize a hostname: lowercase and strip a leading "www.". */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Extract the hostname from a URL string, or null if it is not parseable. */
export function hostOf(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

/**
 * Build the effective allowlist for a request. Optionally include a company's
 * own investor-relations domain (from the stocks table) when present.
 */
export function buildAllowlist(irDomain?: string | null): string[] {
  const list = [...BASE_ALLOWLIST];
  if (irDomain) {
    const h = normalizeHost(irDomain.trim());
    if (h && !list.includes(h)) list.push(h);
  }
  return list;
}

/**
 * True when a URL's host is on the allowlist (suffix match on the registrable
 * host, so subdomains of an allowed domain are allowed).
 */
export function isAllowlisted(url: string, allowlist: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return allowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}
