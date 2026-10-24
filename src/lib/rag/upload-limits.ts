/**
 * User-document upload limits and validation. Pure helpers (no I/O) so they can
 * be unit-tested and reused by the upload route.
 */

export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  maxPages: 150,
  maxDocumentsPerUser: 5,
  maxUploadsPerHour: 3,
} as const;

export type UploadValidationError =
  | "not_pdf"
  | "too_large"
  | "empty"
  | "too_many_documents"
  | "rate_limited";

export const UPLOAD_ERROR_MESSAGES: Record<UploadValidationError, string> = {
  not_pdf: "Only PDF files are supported.",
  too_large: "The file exceeds the 10 MB limit.",
  empty: "The file is empty.",
  too_many_documents: "You can keep at most 5 documents. Delete one to upload more.",
  rate_limited: "You can upload at most 3 documents per hour. Please try again later.",
};

/** A PDF starts with the "%PDF-" signature (magic bytes). */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

export interface FileLike {
  type: string;
  size: number;
  name: string;
}

/**
 * Validate the declared MIME type + size of an upload. The file-signature
 * check (hasPdfSignature) is done separately on the actual bytes in the route.
 */
export function validateUploadMeta(
  file: FileLike,
): UploadValidationError | null {
  if (file.size === 0) return "empty";
  if (file.size > UPLOAD_LIMITS.maxBytes) return "too_large";
  const isPdfMime =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfMime) return "not_pdf";
  return null;
}
