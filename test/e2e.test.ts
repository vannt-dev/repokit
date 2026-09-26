import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { run } from "../src/cli.js";
import { capture, tempDir } from "./helpers.js";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });

async function nodeRepo(withGit = true): Promise<string> {
  const dir = await tempDir();
  await writeFile(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "demo", scripts: { test: "vitest run" }, devDependencies: { prettier: "^3.0.0" } }, null, 2)}\n`,
  );
  if (withGit) {
    sh(dir, "init", "-q", "-b", "main");
    sh(dir, "config", "user.name", "Demo User");
    sh(dir, "config", "user.email", "demo@example.com");
    sh(dir, "config", "core.autocrlf", "false");
    sh(dir, "remote", "add", "origin", "https://github.com/demo-owner/demo.git");
    sh(dir, "add", "-A");
    sh(dir, "commit", "-qm", "chore: initial");
  }
  return dir;
}

async function repokeeper(dir: string, ...args: string[]) {
  const c = capture(dir);
  const code = await run(args, c.io);
  return { code, out: c.out.join("\n"), err: c.err.join("\n") };
}

const commitAll = (dir: string) => {
  sh(dir, "add", "-A");
  sh(dir, "commit", "-qm", "chore: sync");
};

describe("repokeeper end to end", () => {
  it("initialises, checks clean, detects an edit and resolves it", async () => {
    const dir = await nodeRepo();
    const init = await repokeeper(dir, "init");
    expect(init.code).toBe(0);
    const config = parse(await readFile(join(dir, ".repokeeper.yml"), "utf8"));
    expect(config.stacks).toEqual(["node"]);
    expect(config.modules.health.codeowners).toEqual(["@demo-owner"]);
    expect(config.modules.health.copyright).toMatch(/^\d{4} Demo User$/);
    expect(existsSync(join(dir, "lefthook.yml"))).toBe(true);
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf8")).devDependencies.lefthook).toBe("^2.1.14");
    commitAll(dir);

    expect((await repokeeper(dir, "check")).code).toBe(0);

    await appendFile(join(dir, "lefthook.yml"), "# local tweak\n");
    const drift = await repokeeper(dir, "check");
    expect(drift.code).toBe(1);
    expect(drift.out).toContain("conflict");
    expect(drift.out).toContain("lefthook.yml");

    const guarded = await repokeeper(dir, "update", "--accept", "lefthook.yml");
    expect(guarded.code).toBe(2);
    expect(guarded.err).toContain("uncommitted changes in lefthook.yml");

    const accepted = await repokeeper(dir, "update", "--accept", "lefthook.yml", "--force");
    expect(accepted.code).toBe(0);
    expect(await readFile(join(dir, "lefthook.yml"), "utf8")).not.toContain("local tweak");
    expect((await repokeeper(dir, "check")).code).toBe(0);
  });

  it("keeps a user-edited file on update and writes the new version beside it", async () => {
    const dir = await nodeRepo();
    await repokeeper(dir, "init");
    commitAll(dir);
    const lockPath = join(dir, ".repokeeper/lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    // Pretend repokeeper last wrote different content, then the user edited the file.
    for (const entry of lock.entries) if (entry.id === "file:lefthook.yml") entry.hash = "0".repeat(64);
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    await appendFile(join(dir, "lefthook.yml"), "# mine\n");
    commitAll(dir);
    const update = await repokeeper(dir, "update");
    expect(update.code).toBe(1);
    expect(await readFile(join(dir, "lefthook.yml"), "utf8")).toContain("# mine");
    expect(existsSync(join(dir, "lefthook.yml.repokeeper-new"))).toBe(true);
  });

  it("works outside git and without a remote", async () => {
    const dir = await nodeRepo(false);
    const init = await repokeeper(dir, "init");
    expect(init.code).toBe(0);
    expect(existsSync(join(dir, ".github/CODEOWNERS"))).toBe(false);
    expect(existsSync(join(dir, "SECURITY.md"))).toBe(true);
  });

  it("does not overwrite existing files unless adopted", async () => {
    const dir = await nodeRepo();
    await writeFile(join(dir, "LICENSE"), "All rights reserved.\n");
    commitAll(dir);
    const init = await repokeeper(dir, "init");
    expect(init.code).toBe(0);
    expect(init.out).toContain("unmanaged");
    expect(await readFile(join(dir, "LICENSE"), "utf8")).toBe("All rights reserved.\n");
  });

  it("refuses to init twice, reports a missing config and a corrupt lock", async () => {
    const dir = await nodeRepo();
    await repokeeper(dir, "init");
    expect((await repokeeper(dir, "init")).code).toBe(2);
    await writeFile(join(dir, ".repokeeper/lock.json"), "garbage");
    const check = await repokeeper(dir, "check");
    expect(check.code).toBe(1);
    expect(check.err).toContain("repokeeper init --relock");
    expect((await repokeeper(dir, "init", "--relock")).code).toBe(0);
    expect((await repokeeper(dir, "check")).code).toBe(0);
    expect((await repokeeper(await tempDir(), "check")).code).toBe(2);
  });

  it("refuses to write over uncommitted files without printing a plan it will not apply", async () => {
    const dir = await nodeRepo();
    await appendFile(join(dir, "package.json"), "\n");
    const refused = await repokeeper(dir, "init");
    expect(refused.code).toBe(2);
    expect(refused.out).toBe("");
    expect(refused.err).toContain("uncommitted changes in package.json;");
    expect(existsSync(join(dir, ".repokeeper.yml"))).toBe(false);
  });

  it("names untracked files and says how to proceed in a repository without commits", async () => {
    const dir = await nodeRepo(false);
    sh(dir, "init", "-q", "-b", "main");
    const refused = await repokeeper(dir, "init");
    expect(refused.code).toBe(2);
    expect(refused.out).toBe("");
    expect(refused.err).toContain("uncommitted changes in package.json (untracked)");
    expect(refused.err).toContain("untracked files are protected too");
  });

  it("keeps jobs the user adds to ci.yml and reports edits to the jobs it manages", async () => {
    const dir = await nodeRepo();
    await repokeeper(dir, "init");
    const ci = join(dir, ".github/workflows/ci.yml");
    await appendFile(ci, "  docs:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo docs\n");
    commitAll(dir);
    expect((await repokeeper(dir, "check")).code).toBe(0);

    await writeFile(ci, (await readFile(ci, "utf8")).replace('["22","24"]', '["24"]'));
    const drift = await repokeeper(dir, "check");
    expect(drift.code).toBe(1);
    expect(drift.out).toContain("conflict   .github/workflows/ci.yml (jobs.node)");
  });

  it("changes nothing on a dry run and prints JSON for check", async () => {
    const dir = await nodeRepo();
    expect((await repokeeper(dir, "init", "--dry-run")).code).toBe(0);
    expect(existsSync(join(dir, ".repokeeper.yml"))).toBe(false);
    await repokeeper(dir, "init");
    const json = await repokeeper(dir, "check", "--json");
    expect(JSON.parse(json.out)).toMatchObject({ clean: true, standard: { config: "1.0.0", current: "1.0.0" } });
  });
});
