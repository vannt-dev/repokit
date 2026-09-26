import { createHash } from "node:crypto";

export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Hash of the LF-normalised text, so a checkout that converts to CRLF still matches. */
export function hashText(text: string): string {
  return createHash("sha256").update(normalizeEol(text)).digest("hex");
}
