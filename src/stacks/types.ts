import type { StackId } from "../config/types.js";
import type { ResolvedStack } from "../model.js";

/** The stack's entry under `stack_options` in .repokeeper.yml. */
export type StackOptions = Record<string, unknown>;

export interface StackPack {
  id: StackId;
  /** Files whose presence at the repository root selects this pack. */
  detect: string[];
  /** Reads the repository to decide concrete commands. The only stack code that touches disk. */
  resolve(root: string, options?: StackOptions): Promise<ResolvedStack>;
}
