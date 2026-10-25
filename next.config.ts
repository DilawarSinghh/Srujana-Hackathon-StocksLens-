import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this project (a stray lockfile in $HOME otherwise
  // makes Next infer the wrong workspace root).
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      // Google account avatars returned by OAuth.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Security headers applied to every route.
  async headers() {
    // Allow the configured Supabase project origin for API + storage calls.
    const supabaseOrigin = (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
      } catch {
        return "";
      }
    })();
    const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

    // CSP shipped in REPORT-ONLY mode first so it cannot break the app. Review
    // violation reports, then rename the key to "Content-Security-Policy" to
    // enforce. 'unsafe-inline' for styles is required by Tailwind/shadcn and
    // next-themes; blob:/data: are needed by jsPDF and the chart libraries.
    const csp = [
      "default-src 'self'",
      `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.trim(),
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      // Next.js injects inline bootstrap scripts; 'unsafe-inline' is needed
      // until a nonce-based setup is added.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "frame-src 'self' https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
