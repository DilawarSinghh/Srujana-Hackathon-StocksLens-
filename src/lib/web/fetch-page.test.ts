import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DNS so SSRF resolution is deterministic. Default: public IP.
const lookup = vi.fn();
vi.mock("node:dns", () => ({
  promises: { lookup: (...a: unknown[]) => lookup(...a) },
}));

import {
  fetchPageText,
  extractText,
  PageFetchError,
  MAX_TEXT_CHARS,
} from "./fetch-page";
import { buildAllowlist } from "@/config/web-sources";

const allowlist = buildAllowlist();

/** Build a mock Response with a readable stream body. */
function mockResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? { "content-type": "text/html" });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(status >= 200 && status < 300 ? stream : stream, {
    status,
    headers,
  }) as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "8.8.8.8" }]); // public by default
});

describe("extractText", () => {
  it("strips scripts, styles and tags", () => {
    const html =
      "<html><head><title>x</title></head><body><script>evil()</script><style>a{}</style><p>Hello <b>world</b></p></body></html>";
    const out = extractText(html);
    expect(out).toContain("Hello");
    expect(out).toContain("world");
    expect(out).not.toContain("evil");
    expect(out).not.toContain("a{}");
  });
  it("caps nothing itself (caller slices)", () => {
    expect(extractText("<p>short</p>")).toBe("short");
  });
});

describe("fetchPageText policy", () => {
  it("refuses non-https URLs", async () => {
    await expect(
      fetchPageText("http://nseindia.com/x", allowlist),
    ).rejects.toMatchObject({ reason: "not-https" });
  });

  it("refuses non-allowlisted domains", async () => {
    await expect(
      fetchPageText("https://randomblog.com/x", allowlist),
    ).rejects.toMatchObject({ reason: "not-allowlisted" });
  });

  it("blocks SSRF: host resolving to a private IP", async () => {
    lookup.mockResolvedValue([{ address: "169.254.169.254" }]);
    await expect(
      fetchPageText("https://nseindia.com/x", allowlist),
    ).rejects.toMatchObject({ reason: "ssrf-blocked" });
  });

  it("fetches and extracts an allowlisted html page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse("<p>Revenue was strong this quarter.</p>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const res = await fetchPageText("https://nseindia.com/report", allowlist);
    expect(res.text).toContain("Revenue was strong");
    expect(res.url).toBe("https://nseindia.com/report");
    expect(res.text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
  });

  it("rejects a non-text content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    await expect(
      fetchPageText("https://nseindia.com/x.pdf", allowlist),
    ).rejects.toMatchObject({ reason: "bad-content-type" });
  });

  it("rejects an oversized declared content-length", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse("x", {
        headers: { "content-type": "text/html", "content-length": "2000000" },
      }),
    );
    await expect(
      fetchPageText("https://nseindia.com/big", allowlist),
    ).rejects.toMatchObject({ reason: "too-large" });
  });

  it("follows an allowlisted redirect and re-validates it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockResponse("", {
          status: 301,
          headers: { location: "https://bseindia.com/final" },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse("<p>Final page</p>", {
          headers: { "content-type": "text/html" },
        }),
      );
    const res = await fetchPageText("https://nseindia.com/start", allowlist);
    expect(res.url).toBe("https://bseindia.com/final");
    expect(res.text).toContain("Final page");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect to a non-allowlisted host", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse("", {
        status: 302,
        headers: { location: "https://evil.example/pwn" },
      }),
    );
    await expect(
      fetchPageText("https://nseindia.com/start", allowlist),
    ).rejects.toMatchObject({ reason: "not-allowlisted" });
  });

  it("refuses a redirect to a blocked (SSRF) host", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockResponse("", {
        status: 302,
        headers: { location: "https://moneycontrol.com/x" },
      }),
    );
    // First hop (nseindia) resolves public; redirect target resolves private.
    lookup
      .mockResolvedValueOnce([{ address: "8.8.8.8" }])
      .mockResolvedValueOnce([{ address: "10.0.0.9" }]);
    await expect(
      fetchPageText("https://nseindia.com/start", allowlist),
    ).rejects.toMatchObject({ reason: "ssrf-blocked" });
  });
});

describe("PageFetchError", () => {
  it("carries a machine-readable reason", () => {
    expect(new PageFetchError("timeout").reason).toBe("timeout");
  });
});
