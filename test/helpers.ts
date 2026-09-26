import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "../src/cli.js";
import { defaultConfig, type ModulesConfig, type RepokeeperConfig } from "../src/config/types.js";
import type { ModuleContext, RepoInfo, ResolvedStack } from "../src/model.js";
import { githubPlatform } from "../src/platforms/github.js";

export function capture(cwd: string = process.cwd()): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { cwd, out: (line) => out.push(line), err: (line) => err.push(line) }, out, err };
}

export function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "repokeeper-"));
}

export function nodeResolved(overrides: Partial<ResolvedStack> = {}): ResolvedStack {
  return {
    id: "node",
    staged: [{ name: "node:prettier", glob: "*.{js,ts}", run: "npx prettier --write --ignore-unknown {staged_files}" }],
    test: "npm test",
    install: "npm install",
    gitignore: ["Node"],
    dependabot: ["npm"],
    ...overrides,
  };
}

export function makeContext(
  overrides: {
    config?: Partial<RepokeeperConfig>;
    modules?: Partial<ModulesConfig>;
    stacks?: ResolvedStack[];
    repo?: RepoInfo;
  } = {},
): ModuleContext {
  const base = defaultConfig({
    stacks: ["node"],
    standard: "1.0.0",
    copyright: "2026 Van Nguyen",
    contact: "https://github.com/vannt-dev",
    codeowners: ["@vannt-dev"],
  });
  const config: RepokeeperConfig = { ...base, ...overrides.config, modules: { ...base.modules, ...overrides.modules } };
  return {
    config,
    stacks: overrides.stacks ?? [nodeResolved()],
    platform: githubPlatform,
    repo: overrides.repo ?? { owner: "vannt-dev", name: "example" },
  };
}
