import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { dirtyPaths, isGitRepo, parseRemoteUrl, repoInfo } from "../src/git.js";
import { tempDir } from "./helpers.js";

it("parses GitHub remotes in HTTPS and SSH form", () => {
  expect(parseRemoteUrl("https://github.com/vannt-dev/repokit.git")).toEqual({ owner: "vannt-dev", name: "repokit" });
  expect(parseRemoteUrl("git@github.com:vannt-dev/repokit.git\n")).toEqual({ owner: "vannt-dev", name: "repokit" });
  expect(parseRemoteUrl("https://gitlab.com/a/b.git")).toBeNull();
});

it("falls back to the directory name outside git", async () => {
  const dir = await tempDir();
  expect(await isGitRepo(dir)).toBe(false);
  expect((await repoInfo(dir)).owner).toBeNull();
  expect(await dirtyPaths(dir, ["a.txt"])).toEqual([]);
});

it("lists modified and untracked files among the given paths", async () => {
  const dir = await tempDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  await writeFile(join(dir, "a.txt"), "a");
  await writeFile(join(dir, "b.txt"), "b");
  expect(await dirtyPaths(dir, ["a.txt", "c.txt"])).toEqual([{ path: "a.txt", untracked: true }]);
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "a.txt"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a"], { cwd: dir });
  await writeFile(join(dir, "a.txt"), "changed");
  expect(await dirtyPaths(dir, ["a.txt", "b.txt"])).toEqual([
    { path: "a.txt", untracked: false },
    { path: "b.txt", untracked: true },
  ]);
});
