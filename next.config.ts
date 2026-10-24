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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
