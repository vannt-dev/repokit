import type { StackId } from "../config/types.js";
import type { ResolvedStack } from "../model.js";

/** The stack's entry under `stack_options` in .repokeeper.yml. */
export type StackOptions = Record<string, unknown>;

export interface StackPack {
  id: StackId;
  /** Whether the repository at `root` uses this stack. */
  detect(root: string): boolean;
  /** Reads the repository to decide concrete commands. The only stack code that touches disk. */
  resolve(root: string, options?: StackOptions): Promise<ResolvedStack>;
}
