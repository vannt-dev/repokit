import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { RepoInfo } from "./model.js";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
    return stdout;
  } catch {
    return null;
  }
}

export async function isGitRepo(root: string): Promise<boolean> {
  return (await git(root, ["rev-parse", "--is-inside-work-tree"]))?.trim() === "true";
}

export function parseRemoteUrl(url: string): { owner: string; name: string } | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? { owner: match[1] as string, name: match[2] as string } : null;
}

export async function repoInfo(root: string): Promise<RepoInfo> {
  const url = await git(root, ["remote", "get-url", "origin"]);
  return (url ? parseRemoteUrl(url) : null) ?? { owner: null, name: basename(root) };
}

export async function gitUserName(root: string): Promise<string | null> {
  return (await git(root, ["config", "user.name"]))?.trim() || null;
}

export interface DirtyPath {
  path: string;
  untracked: boolean;
}

/** Paths among `paths` with uncommitted changes, including untracked files. Empty outside git. */
export async function dirtyPaths(root: string, paths: string[]): Promise<DirtyPath[]> {
  if (paths.length === 0 || !(await isGitRepo(root))) return [];
  const out = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...paths]);
  if (!out) return [];
  const tokens = out.split("\0").filter(Boolean);
  const dirty: DirtyPath[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    dirty.push({ path: token.slice(3), untracked: token.startsWith("??") });
    if (token.startsWith("R") || token.startsWith("C")) i++;
  }
  return dirty;
}
