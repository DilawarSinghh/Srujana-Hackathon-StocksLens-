import { describe, it, expect } from "vitest";
import {
  validateUploadMeta,
  hasPdfSignature,
  UPLOAD_LIMITS,
} from "./upload-limits";

describe("validateUploadMeta", () => {
  it("accepts a valid PDF under the size limit", () => {
    expect(
      validateUploadMeta({ type: "application/pdf", size: 1000, name: "a.pdf" }),
    ).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(
      validateUploadMeta({ type: "application/pdf", size: 0, name: "a.pdf" }),
    ).toBe("empty");
  });

  it("rejects a file over 10 MB", () => {
    expect(
      validateUploadMeta({
        type: "application/pdf",
        size: UPLOAD_LIMITS.maxBytes + 1,
        name: "a.pdf",
      }),
    ).toBe("too_large");
  });

  it("rejects a non-PDF MIME and extension", () => {
    expect(
      validateUploadMeta({ type: "image/png", size: 100, name: "a.png" }),
    ).toBe("not_pdf");
  });

  it("accepts a .pdf extension even if MIME is generic", () => {
    expect(
      validateUploadMeta({
        type: "application/octet-stream",
        size: 100,
        name: "report.PDF",
      }),
    ).toBeNull();
  });
});

describe("hasPdfSignature", () => {
  it("accepts bytes starting with %PDF-", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(hasPdfSignature(bytes)).toBe(true);
  });

  it("rejects bytes without the signature", () => {
    expect(hasPdfSignature(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]))).toBe(false);
  });

  it("rejects too-short input", () => {
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});
