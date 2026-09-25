import { existsSync } from "node:fs";
import { join } from "node:path";
import type { StackId } from "../config/types.js";
import { UsageError } from "../errors.js";
import { nodeStack } from "./node.js";
import type { StackPack } from "./types.js";

const PACKS: Partial<Record<StackId, StackPack>> = { node: nodeStack };

export function getStackPack(id: StackId): StackPack {
  const pack = PACKS[id];
  if (!pack) throw new UsageError(`the ${id} stack is not available in this version of repokit`);
  return pack;
}

export async function detectStacks(root: string): Promise<StackId[]> {
  return Object.values(PACKS)
    .filter((pack) => pack.detect.some((file) => existsSync(join(root, file))))
    .map((pack) => pack.id);
}
