import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Output, outputId } from "../model.js";
import { removeBlock, upsertBlock } from "./block.js";
import { hashText } from "./hash.js";
import { deleteAtPath, formatJson, setAtPath } from "./json.js";
import { type Lock, type LockEntry, type Target, targetOf, writeLock } from "./lock.js";
import { desiredText } from "./state.js";
import type { SyncResult } from "./sync.js";

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function write(root: string, output: Output): Promise<void> {
  const path = join(root, output.path);
  if (output.kind === "file") return put(path, output.content);
  const existing = await readOrNull(path);
  if (output.kind === "block") return put(path, upsertBlock(existing, output.id, output.body, output.comment));
  const data = existing ? (JSON.parse(existing) as Record<string, unknown>) : {};
  setAtPath(data, output.keyPath, output.value);
  return put(path, formatJson(data, existing));
}

async function remove(root: string, target: Target): Promise<void> {
  const path = join(root, target.path);
  if (target.kind === "file") return rm(path, { force: true });
  const existing = await readOrNull(path);
  if (existing === null) return;
  if (target.kind === "block") return put(path, removeBlock(existing, target.id, target.comment));
  const data = JSON.parse(existing) as Record<string, unknown>;
  deleteAtPath(data, target.keyPath);
  return put(path, formatJson(data, existing));
}

export async function applySync(
  root: string,
  result: SyncResult,
  previous: Lock | null,
  standard: string,
): Promise<Lock> {
  const previousEntries = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
  const entries: LockEntry[] = [];
  for (const { output, action } of result.decisions) {
    const id = outputId(output);
    if (action === "create" || action === "write" || action === "adopt") await write(root, output);
    if (action === "conflict" && output.kind === "file")
      await put(join(root, `${output.path}.repokit-new`), output.content);
    if (action === "conflict") {
      const kept = previousEntries.get(id);
      if (kept) entries.push(kept);
    } else if (action !== "unmanaged") {
      entries.push({ id, module: output.module, hash: hashText(desiredText(output)), target: targetOf(output) });
    }
  }
  for (const removal of result.removals) {
    if (removal.action === "delete") await remove(root, removal.entry.target);
  }
  const lock: Lock = { lockVersion: 1, standard, entries };
  await writeLock(root, lock);
  return lock;
}
