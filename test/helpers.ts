import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "../src/cli.js";

export function capture(cwd: string = process.cwd()): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { cwd, out: (line) => out.push(line), err: (line) => err.push(line) }, out, err };
}

export function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "repokit-"));
}
