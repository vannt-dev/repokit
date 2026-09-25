import { readFileSync } from "node:fs";
import { normalizeEol } from "./sync/hash.js";

/** Reads a bundled template with LF endings; works from src/ (tests) and dist/ (package). */
export function readTemplate(relativePath: string): string {
  return normalizeEol(readFileSync(new URL(`../templates/${relativePath}`, import.meta.url), "utf8"));
}
