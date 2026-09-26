import type { Io } from "../cli.js";
import { describeOutput } from "../model.js";
import type { SyncResult } from "../sync/sync.js";

export interface CommandOptions {
  dryRun: boolean;
  force: boolean;
  adopt: string[];
  adoptAll: boolean;
  accept: string[];
  stacks: import("../config/types.js").StackId[];
  relock: boolean;
  json: boolean;
}

const HINTS: Record<string, (path: string) => string> = {
  conflict: (p) =>
    `edited locally; take repokeeper's version with --accept ${p}, or add it to owned in .repokeeper.yml`,
  unmanaged: (p) => `exists and is not managed; let repokeeper manage it with --adopt ${p}, or add it to owned`,
};

export function printResult(io: Io, result: SyncResult): void {
  let unchanged = 0;
  for (const { output, action } of result.decisions) {
    if (action === "unchanged") {
      unchanged++;
      continue;
    }
    const hint = HINTS[action]?.(output.path);
    io.out(`${action.padEnd(10)} ${describeOutput(output)}${hint ? ` (${hint})` : ""}`);
  }
  for (const { entry, action } of result.removals) {
    if (action === "gone") continue;
    const label = action === "delete" ? "delete" : "kept";
    const note = action === "delete" ? "" : " (no longer generated, but edited locally; left in place)";
    io.out(`${label.padEnd(10)} ${entry.target.path}${note}`);
  }
  io.out(`${unchanged} output(s) already match the standard`);
}

export function hasDrift(result: SyncResult): boolean {
  return result.decisions.some((d) => d.action !== "unchanged") || result.removals.length > 0;
}
