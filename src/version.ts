import { readFileSync } from "node:fs";

export const PACKAGE_VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

/** The standard this build of repokit applies. Bump it whenever generated output changes. */
export const STANDARD_VERSION = "1.0.0";

export const TOOL_VERSIONS = {
  lefthook: "2.1.14",
  commitlintCli: "21.2.3",
  commitlintConventional: "21.2.3",
} as const;

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
