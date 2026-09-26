import { STACK_IDS, type StackId } from "../config/types.js";
import { UsageError } from "../errors.js";
import { dartStack } from "./dart.js";
import { nodeStack } from "./node.js";
import { pythonStack } from "./python.js";
import type { StackPack } from "./types.js";

const PACKS: Partial<Record<StackId, StackPack>> = { node: nodeStack, python: pythonStack, dart: dartStack };

export function getStackPack(id: StackId): StackPack {
  const pack = PACKS[id];
  if (!pack) throw new UsageError(`the ${id} stack is not available in this version of repokeeper`);
  return pack;
}

export async function detectStacks(root: string): Promise<StackId[]> {
  const found = STACK_IDS.filter((id) => PACKS[id]?.detect(root) ?? false);
  // scripts beside another stack belong to that stack; the script pack is for script-only repositories
  return found.length > 1 ? found.filter((id) => id !== "script") : found;
}
