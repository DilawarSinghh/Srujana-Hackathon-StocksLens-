/**
 * Default destination for authenticated users after sign-in.
 */
export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

/**
 * Validates a post-login return path and returns a safe destination.
 *
 * Only safe, same-origin internal paths are allowed. A value is accepted when
 * it starts with a single "/" and is not a protocol-relative ("//host") or
 * backslash-escaped ("/\\host") URL — both of which browsers can treat as
 * external origins, enabling open redirects. Anything else falls back to the
 * default authenticated home.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_SIGNED_IN_PATH,
): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
