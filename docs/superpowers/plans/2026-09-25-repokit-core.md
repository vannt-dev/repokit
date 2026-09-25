# repokit core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `repokit` CLI whose `init`, `check` and `update` apply and maintain the core standard (editorconfig, commits, hooks, community health files, gitignore, Dependabot) on Node repositories.

**Architecture:** A pure planner turns `.repokit.yml`, resolved stack packs and the GitHub platform adapter into a list of desired outputs (whole files, marked blocks, JSON keys). A sync engine compares them with the working tree and `.repokit/lock.json`, decides per output (create, write, unchanged, conflict, unmanaged, adopt) and applies the change set. Commands are thin layers over planner + sync.

**Tech Stack:** Node.js ≥ 22.12, TypeScript 7 (`tsc`), ESM (`"type": "module"`, NodeNext), Vitest 5, `yaml` 2.9, `ajv` 8.20, `node:util.parseArgs`.

**Spec:** `docs/superpowers/specs/2026-09-25-repokit-design.md` — this plan implements delivery steps 1–2 (skeleton, core modules, node pack). Later plans: (2) reusable workflows + `ci` and `release` modules, (3) python, dart, script, java and dotnet packs plus NestJS awareness, (4) `repokit github apply`.

## Global Constraints

- Package name `@vannt-dev/repokit`; command `repokit`; `engines.node` `>=22.12.0`.
- Config file `.repokit.yml`; lock file `.repokit/lock.json`; standard version `1.0.0`.
- Pinned tool versions for the standard: lefthook `2.1.14`, `@commitlint/cli` `21.2.3`, `@commitlint/config-conventional` `21.2.3`.
- Exit codes: `0` success, `1` drift or conflicts, `2` config or usage error.
- Never overwrite content the user edited; never write outside the repository root.
- Paths in config, lock and output are POSIX (`/`) on every OS.
- Every generated file starts with the managed header: `Managed by repokit (https://github.com/vannt-dev/repokit). Edits are reported by \`repokit check\`.` in the file's comment syntax (LICENSE and CODE_OF_CONDUCT excepted: their text is standard).
- Commits follow Conventional Commits with no `Co-Authored-By` or other trailers.
- Work happens on branch `feat/core`; `main` only receives it through a pull request.

## Review Focus

- A `.gitignore` or `.gitattributes` without a trailing newline: the block must start on its own line, separated by a blank line, not glued to the last rule. → test in Task 3.
- A `package.json` indented with four spaces or tabs, or with CRLF endings: repokit's key edits must keep that indentation, line ending and final newline. → test in Task 3.
- A Windows checkout with `core.autocrlf=true` turns repokit's LF files into CRLF: `check` must still report them unchanged. → test in Task 8.
- An empty `.repokit.yml`, or one with a typo in a key: a message naming the key and line, exit 2, no stack trace. → test in Task 2.
- A directory that is not a git repository, or has no `origin` remote: `init` still works, skips the uncommitted-changes guard and omits CODEOWNERS. → test in Task 10.

---

## File structure

```
package.json · tsconfig.json · tsconfig.build.json · vitest.config.ts · .gitignore · README.md
src/
  cli.ts              argument parsing, dispatch, exit codes
  version.ts          PACKAGE_VERSION, STANDARD_VERSION, TOOL_VERSIONS, compareVersions
  errors.ts           RepokitError, ConfigError, UsageError, LockError
  model.ts            Output types, outputId, ResolvedStack, ModuleContext, Module, PlatformAdapter, MANAGED_HEADER
  templates.ts        readTemplate()
  git.ts              isGitRepo, parseRemoteUrl, repoInfo, gitUserName, dirtyPaths
  plan.ts             planOutputs()
  config/types.ts     RepokitConfig, STACK_IDS, defaultConfig()
  config/schema.ts    JSON Schema for .repokit.yml
  config/load.ts      CONFIG_FILE, loadConfig, parseConfig, renderConfig, setStandard
  stacks/types.ts     StackPack
  stacks/node.ts      node pack
  stacks/index.ts     getStackPack, detectStacks
  platforms/github.ts githubPlatform
  modules/editorconfig.ts · gitignore.ts · commits.ts · hooks.ts · health.ts · deps.ts · index.ts
  sync/hash.ts        hashText, normalizeEol
  sync/block.ts       readBlock, upsertBlock, removeBlock
  sync/json.ts        getAtPath, setAtPath, deleteAtPath, formatJson
  sync/lock.ts        LOCK_FILE, Target, targetOf, LockEntry, Lock, readLock, writeLock
  sync/state.ts       desiredText, readCurrent
  sync/decide.ts      decide, decideRemoval
  sync/sync.ts        computeSync, pathsToWrite
  sync/apply.ts       applySync
  commands/context.ts buildContext
  commands/report.ts  printResult, hasDrift
  commands/init.ts · check.ts · update.ts
templates/
  gitignore/Node.gitignore      vendored from github/gitignore
  CODE_OF_CONDUCT.md            Contributor Covenant 2.1, vendored
test/  helpers.ts and one test file per unit (paths given in each task)
```

---

### Task 1: Project skeleton and CLI entry point

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`, `src/version.ts`, `src/errors.ts`, `src/cli.ts`, `test/helpers.ts`, `test/cli.test.ts`

**Interfaces:**
- Produces: `run(argv: string[], io: Io): Promise<number>`; `interface Io { cwd: string; out(line: string): void; err(line: string): void }`; `PACKAGE_VERSION: string`; `STANDARD_VERSION = "1.0.0"`; `TOOL_VERSIONS`; `compareVersions(a, b): number`; error classes; test helpers `capture(cwd)` and `tempDir()`.

- [ ] **Step 1: Create the branch and project files**

```bash
cd F:/ai-agent/repokit
git switch -c feat/core
```

`package.json`:
```json
{
  "name": "@vannt-dev/repokit",
  "version": "0.1.0",
  "description": "Keep every repository on one maintained standard: commits, git hooks, CI, releases, dependency updates and repo settings.",
  "type": "module",
  "bin": { "repokit": "dist/cli.js" },
  "files": ["dist/", "templates/"],
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "ajv": "^8.20.0", "yaml": "^2.9.1" },
  "devDependencies": { "@types/node": "^22.20.4", "typescript": "^7.0.2", "vitest": "^5.0.2" },
  "repository": { "type": "git", "url": "git+https://github.com/vannt-dev/repokit.git" },
  "homepage": "https://github.com/vannt-dev/repokit#readme",
  "bugs": { "url": "https://github.com/vannt-dev/repokit/issues" },
  "keywords": ["repository", "standard", "conventional-commits", "lefthook", "github-actions", "dependabot"],
  "author": "vannt-dev",
  "license": "MIT"
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 20000 } });
```

`.gitignore`:
```
node_modules/
dist/
coverage/
```

Run: `npm install`
Expected: `package-lock.json` created, no errors.

- [ ] **Step 2: Write the failing test**

`test/helpers.ts`:
```ts
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
```

`test/cli.test.ts`:
```ts
import { expect, it } from "vitest";
import { run } from "../src/cli.js";
import { compareVersions } from "../src/version.js";
import { capture } from "./helpers.js";

it("prints the package version", async () => {
  const c = capture();
  expect(await run(["--version"], c.io)).toBe(0);
  expect(c.out).toEqual(["0.1.0"]);
});

it("rejects an unknown command with exit code 2 and usage", async () => {
  const c = capture();
  expect(await run(["frobnicate"], c.io)).toBe(2);
  expect(c.err.join("\n")).toContain("usage: repokit");
});

it("rejects an unknown option with exit code 2", async () => {
  const c = capture();
  expect(await run(["check", "--nope"], c.io)).toBe(2);
  expect(c.err.join("\n")).toContain("--nope");
});

it("compares semantic versions numerically", () => {
  expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  expect(compareVersions("0.9.9", "1.0.0")).toBeLessThan(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 4: Write the implementation**

`src/version.ts`:
```ts
import { readFileSync } from "node:fs";

export const PACKAGE_VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

/** The standard this build of repokit applies. Bump it whenever generated output changes. */
export const STANDARD_VERSION = "1.0.0";

export const TOOL_VERSIONS = {
  lefthook: "2.1.14",
  commitlintCli: "21.2.3",
  commitlintConventional: "21.2.3",
} as const;

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

`src/errors.ts`:
```ts
export class RepokitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** `.repokit.yml` is missing or invalid. */
export class ConfigError extends RepokitError {
  constructor(message: string) {
    super(message, 2);
  }
}

/** The command cannot run as requested. */
export class UsageError extends RepokitError {
  constructor(message: string) {
    super(message, 2);
  }
}

/** `.repokit/lock.json` is unreadable; the repository state is unknown, which counts as drift. */
export class LockError extends RepokitError {
  constructor(message: string) {
    super(message, 1);
  }
}
```

`src/cli.ts`:
```ts
#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { RepokitError, UsageError } from "./errors.js";
import { PACKAGE_VERSION } from "./version.js";

export interface Io {
  cwd: string;
  out(line: string): void;
  err(line: string): void;
}

export const USAGE = [
  "usage: repokit <command> [options]",
  "",
  "commands:",
  "  init    detect stacks, write .repokit.yml and apply the standard",
  "  check   report drift from the standard without writing (exit 1 on drift)",
  "  update  move to the standard of this repokit version and resync",
  "",
  "options:",
  "  --dry-run        show what would change without writing",
  "  --force          write even when target files have uncommitted changes",
  "  --adopt <path>   let repokit manage an existing file (repeatable); --adopt-all for every file",
  "  --accept <path>  take repokit's version of a locally edited file (update, repeatable)",
  "  --stack <id>     stack to use instead of detection (init, repeatable)",
  "  --relock         rebuild .repokit/lock.json from the current files (init)",
  "  --json           machine-readable output (check)",
  "  -v, --version    print the version",
].join("\n");

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        adopt: { type: "string", multiple: true, default: [] },
        "adopt-all": { type: "boolean", default: false },
        accept: { type: "string", multiple: true, default: [] },
        stack: { type: "string", multiple: true, default: [] },
        relock: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }).valueOf() as { values: Record<string, unknown>; positionals: string[] };
    if (values.version) {
      io.out(PACKAGE_VERSION);
      return 0;
    }
    const [command] = positionals;
    if (values.help || command === undefined) {
      io.out(USAGE);
      return command === undefined && !values.help ? 2 : 0;
    }
    throw new UsageError(`unknown command: ${command}`);
  } catch (error) {
    if (error instanceof RepokitError) {
      io.err(`repokit: ${error.message}`);
      if (error instanceof UsageError) io.err(USAGE);
      return error.exitCode;
    }
    if (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS")) {
      io.err(`repokit: ${error.message}`);
      io.err(USAGE);
      return 2;
    }
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && realpathSync(invokedPath) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2), {
    cwd: process.cwd(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  }).then((code) => {
    process.exitCode = code;
  });
}
```

- [ ] **Step 5: Run tests, typecheck and build**

Run: `npx vitest run test/cli.test.ts && npm run typecheck && npm run build && node dist/cli.js --version`
Expected: 4 tests PASS; typecheck clean; build prints nothing; last command prints `0.1.0`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json vitest.config.ts .gitignore src test
git commit -m "feat(cli): add the project skeleton and version command"
```

---

### Task 2: Configuration — types, schema, load, render

**Files:**
- Create: `src/config/types.ts`, `src/config/schema.ts`, `src/config/load.ts`, `test/config.test.ts`

**Interfaces:**
- Consumes: `ConfigError` (Task 1).
- Produces:
  - `STACK_IDS = ["node","python","dart","script","java","dotnet"] as const`; `type StackId`
  - `interface HealthConfig { license: string | false; copyright: string; contact: string; codeowners: string[] }`
  - `interface ModulesConfig { editorconfig: boolean; commits: boolean; hooks: boolean; ci: boolean; release: boolean; deps: boolean; gitignore: boolean; health: HealthConfig | false }`
  - `interface RepokitConfig { schema: 1; standard: string; platform: "github"; stacks: StackId[]; modules: ModulesConfig; owned: string[]; stack_options: Record<string, Record<string, unknown>>; github?: Record<string, unknown> }`
  - `defaultConfig(input: { stacks: StackId[]; standard: string; copyright: string; contact: string; codeowners: string[] }): RepokitConfig`
  - `CONFIG_FILE = ".repokit.yml"`; `loadConfig(root): Promise<RepokitConfig>`; `parseConfig(text): RepokitConfig`; `renderConfig(config): string`; `setStandard(text, version): string`

- [ ] **Step 1: Write the failing test**

`test/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseConfig, renderConfig, setStandard } from "../src/config/load.js";
import { defaultConfig } from "../src/config/types.js";
import { ConfigError } from "../src/errors.js";

const base = defaultConfig({
  stacks: ["node"],
  standard: "1.0.0",
  copyright: "2026 Van Nguyen",
  contact: "https://github.com/vannt-dev",
  codeowners: ["@vannt-dev"],
});

function errorOf(text: string): string {
  try {
    parseConfig(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("expected a ConfigError");
}

describe("parseConfig", () => {
  it("round-trips the rendered default config", () => {
    expect(parseConfig(renderConfig(base))).toEqual(base);
  });

  it("defaults boolean modules to true and optional lists to empty", () => {
    const config = parseConfig(
      "schema: 1\nstandard: 1.0.0\nplatform: github\nstacks: [node]\nmodules:\n  health: false\n",
    );
    expect(config.modules).toEqual({
      editorconfig: true, commits: true, hooks: true, ci: true, release: true, deps: true, gitignore: true, health: false,
    });
    expect(config.owned).toEqual([]);
    expect(config.stack_options).toEqual({});
  });

  it("explains an empty file", () => {
    expect(errorOf("")).toMatch(/^\.repokit\.yml:1: \(root\) must have required property 'schema'/);
  });

  it("names the line and key of an unknown key", () => {
    const text = "schema: 1\nstandard: 1.0.0\nplatform: github\nstacks: [node]\nmodules:\n  health: false\n  hoks: true\n";
    expect(errorOf(text)).toBe(".repokit.yml:7: modules.hoks is not a known key");
  });

  it("lists the allowed values of an enum", () => {
    const text = "schema: 1\nstandard: 1.0.0\nplatform: github\nstacks: [ruby]\nmodules:\n  health: false\n";
    expect(errorOf(text)).toBe(".repokit.yml:4: stacks.0 must be one of: node, python, dart, script, java, dotnet");
  });

  it("reports YAML syntax errors with their line", () => {
    expect(errorOf("schema: 1\nstacks: [node\n")).toMatch(/^\.repokit\.yml:\d+: /);
  });

  it("requires modules.health", () => {
    expect(errorOf("schema: 1\nstandard: 1.0.0\nplatform: github\nstacks: [node]\n")).toContain(
      "modules.health is required",
    );
  });
});

describe("setStandard", () => {
  it("changes only the standard and keeps comments", () => {
    const text = "# keep me\nschema: 1\nstandard: 1.0.0 # applied\nplatform: github\n";
    expect(setStandard(text, "1.1.0")).toBe("# keep me\nschema: 1\nstandard: 1.1.0 # applied\nplatform: github\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — cannot resolve `../src/config/load.js`.

- [ ] **Step 3: Write the implementation**

`src/config/types.ts`:
```ts
export const STACK_IDS = ["node", "python", "dart", "script", "java", "dotnet"] as const;
export type StackId = (typeof STACK_IDS)[number];

export interface HealthConfig {
  /** SPDX id, or false to leave licensing alone. v1 bundles MIT only. */
  license: string | false;
  /** LICENSE holder line, e.g. "2026 Van Nguyen". */
  copyright: string;
  /** Code of Conduct contact: a URL or an e-mail address. */
  contact: string;
  codeowners: string[];
}

export interface ModulesConfig {
  editorconfig: boolean;
  commits: boolean;
  hooks: boolean;
  ci: boolean;
  release: boolean;
  deps: boolean;
  gitignore: boolean;
  health: HealthConfig | false;
}

export interface RepokitConfig {
  schema: 1;
  standard: string;
  platform: "github";
  stacks: StackId[];
  modules: ModulesConfig;
  owned: string[];
  stack_options: Record<string, Record<string, unknown>>;
  github?: Record<string, unknown>;
}

export function defaultConfig(input: {
  stacks: StackId[];
  standard: string;
  copyright: string;
  contact: string;
  codeowners: string[];
}): RepokitConfig {
  return {
    schema: 1,
    standard: input.standard,
    platform: "github",
    stacks: input.stacks,
    modules: {
      editorconfig: true,
      commits: true,
      hooks: true,
      ci: true,
      release: true,
      deps: true,
      gitignore: true,
      health: { license: "MIT", copyright: input.copyright, contact: input.contact, codeowners: input.codeowners },
    },
    owned: [],
    stack_options: {},
  };
}
```

`src/config/schema.ts`:
```ts
import { STACK_IDS } from "./types.js";

const flag = { type: "boolean" } as const;

export const configSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "standard", "platform", "stacks"],
  properties: {
    schema: { const: 1 },
    standard: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    platform: { enum: ["github"] },
    stacks: { type: "array", minItems: 1, uniqueItems: true, items: { enum: [...STACK_IDS] } },
    modules: {
      type: "object",
      additionalProperties: false,
      properties: {
        editorconfig: flag,
        commits: flag,
        hooks: flag,
        ci: flag,
        release: flag,
        deps: flag,
        gitignore: flag,
        health: {
          anyOf: [
            { const: false },
            {
              type: "object",
              additionalProperties: false,
              required: ["license", "copyright", "contact", "codeowners"],
              properties: {
                license: { anyOf: [{ const: false }, { type: "string", minLength: 1 }] },
                copyright: { type: "string", minLength: 1 },
                contact: { type: "string", minLength: 1 },
                codeowners: { type: "array", items: { type: "string", pattern: "^@" } },
              },
            },
          ],
        },
      },
    },
    owned: { type: "array", items: { type: "string", minLength: 1 } },
    stack_options: { type: "object" },
    github: { type: "object" },
  },
} as const;
```

`src/config/load.ts`:
```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv, type ErrorObject } from "ajv";
import { type Document, LineCounter, isNode, parseDocument, stringify } from "yaml";
import { ConfigError } from "../errors.js";
import { configSchema } from "./schema.js";
import type { ModulesConfig, RepokitConfig } from "./types.js";

export const CONFIG_FILE = ".repokit.yml";

const validate = new Ajv({ allErrors: false }).compile(configSchema);

export async function loadConfig(root: string): Promise<RepokitConfig> {
  let text: string;
  try {
    text = await readFile(join(root, CONFIG_FILE), "utf8");
  } catch {
    throw new ConfigError(`${CONFIG_FILE} not found; run \`repokit init\` first`);
  }
  return parseConfig(text);
}

export function parseConfig(text: string): RepokitConfig {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const syntax = doc.errors[0];
  if (syntax) {
    const line = syntax.linePos?.[0]?.line ?? 1;
    throw new ConfigError(`${CONFIG_FILE}:${line}: ${syntax.message.split("\n")[0]}`);
  }
  const data: unknown = doc.toJS() ?? {};
  if (!validate(data)) {
    const error = validate.errors?.[0] as ErrorObject;
    const path = pathOf(error);
    throw new ConfigError(`${CONFIG_FILE}:${lineOf(doc, lineCounter, path)}: ${describe(error, path)}`);
  }
  return withDefaults(data as Partial<RepokitConfig> & Pick<RepokitConfig, "schema" | "standard" | "platform" | "stacks">);
}

export function renderConfig(config: RepokitConfig): string {
  return `# repokit configuration: https://github.com/vannt-dev/repokit\n${stringify(config)}`;
}

/** Rewrites `standard:` in place, keeping every comment and the rest of the layout. */
export function setStandard(text: string, version: string): string {
  const doc = parseDocument(text);
  doc.set("standard", version);
  return doc.toString();
}

function withDefaults(
  data: Partial<RepokitConfig> & Pick<RepokitConfig, "schema" | "standard" | "platform" | "stacks">,
): RepokitConfig {
  const modules = (data.modules ?? {}) as Partial<ModulesConfig>;
  if (modules.health === undefined) {
    throw new ConfigError(
      `${CONFIG_FILE}: modules.health is required; set it to false to leave community health files alone`,
    );
  }
  const config: RepokitConfig = {
    schema: data.schema,
    standard: data.standard,
    platform: data.platform,
    stacks: data.stacks,
    modules: {
      editorconfig: modules.editorconfig ?? true,
      commits: modules.commits ?? true,
      hooks: modules.hooks ?? true,
      ci: modules.ci ?? true,
      release: modules.release ?? true,
      deps: modules.deps ?? true,
      gitignore: modules.gitignore ?? true,
      health: modules.health,
    },
    owned: data.owned ?? [],
    stack_options: data.stack_options ?? {},
  };
  if (data.github !== undefined) config.github = data.github;
  return config;
}

function pathOf(error: ErrorObject): (string | number)[] {
  const segments: (string | number)[] = error.instancePath
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  if (error.keyword === "additionalProperties") {
    segments.push((error.params as { additionalProperty: string }).additionalProperty);
  }
  return segments;
}

function describe(error: ErrorObject, path: (string | number)[]): string {
  const name = path.length > 0 ? path.join(".") : "(root)";
  if (error.keyword === "additionalProperties") return `${name} is not a known key`;
  if (error.keyword === "enum") {
    const allowed = (error.params as { allowedValues: unknown[] }).allowedValues;
    return `${name} must be one of: ${allowed.join(", ")}`;
  }
  return `${name} ${error.message ?? "is invalid"}`;
}

function lineOf(doc: Document, lineCounter: LineCounter, path: (string | number)[]): number {
  for (let length = path.length; length > 0; length--) {
    const node = doc.getIn(path.slice(0, length), true);
    if (isNode(node) && node.range) return lineCounter.linePos(node.range[0]).line;
  }
  return 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config.test.ts && npm run typecheck`
Expected: 8 tests PASS; typecheck clean. If the unknown-key line is reported as the value's line rather than the key's, both are line 7 in the test input.

- [ ] **Step 5: Commit**

```bash
git add src/config test/config.test.ts
git commit -m "feat(config): load and validate .repokit.yml with line-level errors"
```

---

### Task 3: Sync primitives — hashing, marked blocks, JSON keys

**Files:**
- Create: `src/sync/hash.ts`, `src/sync/block.ts`, `src/sync/json.ts`, `test/sync-primitives.test.ts`

**Interfaces:**
- Produces:
  - `normalizeEol(text): string`; `hashText(text): string` (SHA-256 hex of LF-normalised text)
  - `type CommentStyle = "hash" | "html"`; `readBlock(text, id, style): string | null` (body without trailing newline, LF); `upsertBlock(text: string | null, id, body, style): string`; `removeBlock(text, id, style): string`
  - `getAtPath(obj, path: string[]): unknown`; `setAtPath(obj, path, value): void`; `deleteAtPath(obj, path): void`; `formatJson(value, original: string | null): string`

- [ ] **Step 1: Write the failing test**

`test/sync-primitives.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { readBlock, removeBlock, upsertBlock } from "../src/sync/block.js";
import { hashText } from "../src/sync/hash.js";
import { deleteAtPath, formatJson, getAtPath, setAtPath } from "../src/sync/json.js";

describe("hashText", () => {
  it("ignores CRLF versus LF", () => {
    expect(hashText("a\r\nb\r\n")).toBe(hashText("a\nb\n"));
  });
});

describe("blocks", () => {
  const start = "# repokit:start gitignore";
  const end = "# repokit:end gitignore";

  it("creates a file holding only the block", () => {
    expect(upsertBlock(null, "gitignore", "dist/", "hash")).toBe(`${start}\ndist/\n${end}\n`);
  });

  it("appends after a blank line when the file lacks a trailing newline", () => {
    expect(upsertBlock("node_modules/", "gitignore", "dist/", "hash")).toBe(
      `node_modules/\n\n${start}\ndist/\n${end}\n`,
    );
  });

  it("replaces only the block body and keeps CRLF and surrounding content", () => {
    const text = `keep-before\r\n\r\n${start}\r\nold\r\n${end}\r\nkeep-after\r\n`;
    expect(upsertBlock(text, "gitignore", "new-1\nnew-2", "hash")).toBe(
      `keep-before\r\n\r\n${start}\r\nnew-1\r\nnew-2\r\n${end}\r\nkeep-after\r\n`,
    );
  });

  it("reads the body back as LF text", () => {
    expect(readBlock(`x\r\n${start}\r\na\r\nb\r\n${end}\r\n`, "gitignore", "hash")).toBe("a\nb");
    expect(readBlock("no block here\n", "gitignore", "hash")).toBeNull();
  });

  it("uses HTML comments for markdown", () => {
    expect(upsertBlock(null, "x", "body", "html")).toBe("<!-- repokit:start x -->\nbody\n<!-- repokit:end x -->\n");
  });

  it("removes the block and the blank line before it", () => {
    const text = `node_modules/\n\n${start}\ndist/\n${end}\n`;
    expect(removeBlock(text, "gitignore", "hash")).toBe("node_modules/\n");
  });
});

describe("json", () => {
  it("gets, sets and deletes nested keys", () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    setAtPath(obj, ["devDependencies", "lefthook"], "^2.1.14");
    expect(getAtPath(obj, ["devDependencies", "lefthook"])).toBe("^2.1.14");
    expect(getAtPath(obj, ["missing", "x"])).toBeUndefined();
    deleteAtPath(obj, ["a", "b"]);
    expect(obj).toEqual({ a: {}, devDependencies: { lefthook: "^2.1.14" } });
  });

  it("keeps four-space indentation and a final newline", () => {
    const original = '{\n    "name": "x"\n}\n';
    expect(formatJson({ name: "x", v: 1 }, original)).toBe('{\n    "name": "x",\n    "v": 1\n}\n');
  });

  it("keeps tab indentation and CRLF endings", () => {
    const original = '{\r\n\t"name": "x"\r\n}\r\n';
    expect(formatJson({ name: "x" }, original)).toBe('{\r\n\t"name": "x"\r\n}\r\n');
  });

  it("uses two spaces for a new file", () => {
    expect(formatJson({ a: 1 }, null)).toBe('{\n  "a": 1\n}\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sync-primitives.test.ts`
Expected: FAIL — cannot resolve `../src/sync/block.js`.

- [ ] **Step 3: Write the implementation**

`src/sync/hash.ts`:
```ts
import { createHash } from "node:crypto";

export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Hash of the LF-normalised text, so a checkout that converts to CRLF still matches. */
export function hashText(text: string): string {
  return createHash("sha256").update(normalizeEol(text)).digest("hex");
}
```

`src/sync/block.ts`:
```ts
import { normalizeEol } from "./hash.js";

export type CommentStyle = "hash" | "html";

function comment(style: CommentStyle, text: string): string {
  return style === "hash" ? `# ${text}` : `<!-- ${text} -->`;
}

export function startMarker(id: string, style: CommentStyle): string {
  return comment(style, `repokit:start ${id}`);
}

export function endMarker(id: string, style: CommentStyle): string {
  return comment(style, `repokit:end ${id}`);
}

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function locate(lines: string[], id: string, style: CommentStyle): [number, number] | null {
  const start = lines.indexOf(startMarker(id, style));
  if (start < 0) return null;
  const end = lines.indexOf(endMarker(id, style), start + 1);
  return end < 0 ? null : [start, end];
}

export function readBlock(text: string, id: string, style: CommentStyle): string | null {
  const lines = normalizeEol(text).split("\n");
  const range = locate(lines, id, style);
  return range ? lines.slice(range[0] + 1, range[1]).join("\n") : null;
}

export function upsertBlock(text: string | null, id: string, body: string, style: CommentStyle): string {
  const eol = text === null ? "\n" : eolOf(text);
  const blockLines = [startMarker(id, style), ...normalizeEol(body).split("\n"), endMarker(id, style)];
  if (text === null || text.trim() === "") return blockLines.join(eol) + eol;
  const lines = text.split(eol);
  const range = locate(lines, id, style);
  if (range) {
    lines.splice(range[0], range[1] - range[0] + 1, ...blockLines);
    return lines.join(eol);
  }
  const base = text.endsWith(eol) ? text : text + eol;
  return base + eol + blockLines.join(eol) + eol;
}

export function removeBlock(text: string, id: string, style: CommentStyle): string {
  const eol = eolOf(text);
  const lines = text.split(eol);
  const range = locate(lines, id, style);
  if (!range) return text;
  let [start] = range;
  if (start > 0 && lines[start - 1] === "") start -= 1;
  lines.splice(start, range[1] - start + 1);
  return lines.join(eol);
}
```

`src/sync/json.ts`:
```ts
type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function getAtPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function setAtPath(obj: JsonObject, path: string[], value: unknown): void {
  let current = obj;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isObject(next)) current[key] = {};
    current = current[key] as JsonObject;
  }
  current[path[path.length - 1] as string] = value;
}

export function deleteAtPath(obj: JsonObject, path: string[]): void {
  const parent = getAtPath(obj, path.slice(0, -1));
  if (isObject(parent)) delete parent[path[path.length - 1] as string];
}

/** Serialises with the original file's indentation, line ending and final newline. */
export function formatJson(value: unknown, original: string | null): string {
  const indent = original ? (/^([ \t]+)"/m.exec(original)?.[1] ?? 2) : 2;
  const eol = original?.includes("\r\n") ? "\r\n" : "\n";
  return JSON.stringify(value, null, indent).replace(/\n/g, eol) + eol;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sync-primitives.test.ts && npm run typecheck`
Expected: 11 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/sync test/sync-primitives.test.ts
git commit -m "feat(sync): add hashing, marked blocks and JSON key editing"
```

---

### Task 4: Output model, git helpers and the node stack pack

**Files:**
- Create: `src/model.ts`, `src/git.ts`, `src/stacks/types.ts`, `src/stacks/node.ts`, `src/stacks/index.ts`, `test/git.test.ts`, `test/stacks.test.ts`

**Interfaces:**
- Consumes: `RepokitConfig`, `StackId` (Task 2); `CommentStyle` (Task 3); `UsageError` (Task 1).
- Produces:
  - `MANAGED_HEADER` string
  - `type Output = FileOutput | BlockOutput | JsonOutput` with `FileOutput { kind: "file"; path; content; module }`, `BlockOutput { kind: "block"; path; id; body; comment: CommentStyle; module }`, `JsonOutput { kind: "json"; path; keyPath: string[]; value: unknown; module }`; `outputId(o): string`; `describeOutput(o): string`
  - `interface StagedJob { name: string; glob: string; run: string }`
  - `interface ResolvedStack { id: StackId; staged: StagedJob[]; test: string | null; install: string | null; gitignore: string[]; dependabot: string[] }`
  - `interface RepoInfo { owner: string | null; name: string }`
  - `interface ModuleContext { config: RepokitConfig; stacks: ResolvedStack[]; platform: PlatformAdapter; repo: RepoInfo }`
  - `interface Module { id: string; enabled(config: RepokitConfig): boolean; outputs(ctx: ModuleContext): Output[] }`
  - `interface PlatformAdapter { id: "github"; communityFiles(ctx: ModuleContext): Output[]; dependencyUpdates(ecosystems: string[]): Output[] }`
  - `interface StackPack { id: StackId; detect: string[]; resolve(root: string): Promise<ResolvedStack> }`; `nodeStack`; `getStackPack(id): StackPack`; `detectStacks(root): Promise<StackId[]>`
  - `isGitRepo(root)`, `parseRemoteUrl(url)`, `repoInfo(root)`, `gitUserName(root)`, `dirtyPaths(root, paths)`

- [ ] **Step 1: Write the failing tests**

`test/git.test.ts`:
```ts
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
  expect((await dirtyPaths(dir, ["a.txt", "c.txt"])).sort()).toEqual(["a.txt"]);
});
```

`test/stacks.test.ts`:
```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UsageError } from "../src/errors.js";
import { detectStacks, getStackPack } from "../src/stacks/index.js";
import { nodeStack } from "../src/stacks/node.js";
import { tempDir } from "./helpers.js";

async function repoWith(files: Record<string, string>): Promise<string> {
  const dir = await tempDir();
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
  return dir;
}

describe("node stack", () => {
  it("uses prettier and eslint when installed, with npm by default", async () => {
    const dir = await repoWith({
      "package.json": JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { prettier: "3", eslint: "9" } }),
    });
    const stack = await nodeStack.resolve(dir);
    expect(stack.staged.map((j) => j.name)).toEqual(["node:prettier", "node:eslint"]);
    expect(stack.test).toBe("npm test");
    expect(stack.install).toBe("npm install");
    expect(stack.gitignore).toEqual(["Node"]);
    expect(stack.dependabot).toEqual(["npm"]);
  });

  it("prefers biome and follows the pnpm lockfile", async () => {
    const dir = await repoWith({
      "package.json": JSON.stringify({ scripts: { test: "vitest" }, devDependencies: { "@biomejs/biome": "2", prettier: "3" } }),
      "pnpm-lock.yaml": "",
    });
    const stack = await nodeStack.resolve(dir);
    expect(stack.staged.map((j) => j.name)).toEqual(["node:biome"]);
    expect(stack.test).toBe("pnpm test");
  });

  it("skips npm's placeholder test script and missing tools", async () => {
    const dir = await repoWith({
      "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
      "yarn.lock": "",
    });
    const stack = await nodeStack.resolve(dir);
    expect(stack.staged).toEqual([]);
    expect(stack.test).toBeNull();
    expect(stack.install).toBe("yarn install");
  });

  it("reports an unreadable package.json as a usage error", async () => {
    const dir = await repoWith({ "package.json": "{ not json" });
    await expect(nodeStack.resolve(dir)).rejects.toBeInstanceOf(UsageError);
  });
});

describe("registry", () => {
  it("detects node from package.json", async () => {
    expect(await detectStacks(await repoWith({ "package.json": "{}" }))).toEqual(["node"]);
    expect(await detectStacks(await repoWith({ "README.md": "" }))).toEqual([]);
  });

  it("explains that other packs are not available yet", () => {
    expect(() => getStackPack("python")).toThrow(UsageError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/git.test.ts test/stacks.test.ts`
Expected: FAIL — cannot resolve `../src/git.js`.

- [ ] **Step 3: Write the implementation**

`src/model.ts`:
```ts
import type { RepokitConfig, StackId } from "./config/types.js";
import type { CommentStyle } from "./sync/block.js";

export const MANAGED_HEADER =
  "Managed by repokit (https://github.com/vannt-dev/repokit). Edits are reported by `repokit check`.";

export interface FileOutput { kind: "file"; path: string; content: string; module: string }
export interface BlockOutput { kind: "block"; path: string; id: string; body: string; comment: CommentStyle; module: string }
export interface JsonOutput { kind: "json"; path: string; keyPath: string[]; value: unknown; module: string }
export type Output = FileOutput | BlockOutput | JsonOutput;

export function outputId(output: Output): string {
  if (output.kind === "file") return `file:${output.path}`;
  if (output.kind === "block") return `block:${output.path}#${output.id}`;
  return `json:${output.path}#${JSON.stringify(output.keyPath)}`;
}

export function describeOutput(output: Output): string {
  if (output.kind === "file") return output.path;
  if (output.kind === "block") return `${output.path} (block ${output.id})`;
  return `${output.path} (${output.keyPath.join(".")})`;
}

export interface StagedJob { name: string; glob: string; run: string }

export interface ResolvedStack {
  id: StackId;
  /** lefthook pre-commit jobs; `{staged_files}` is filled in by lefthook. */
  staged: StagedJob[];
  /** Command for the pre-push test hook, or null when the repository has no tests. */
  test: string | null;
  /** Command that installs dependencies, quoted in CONTRIBUTING.md. */
  install: string | null;
  /** Template names under templates/gitignore/. */
  gitignore: string[];
  /** Dependabot package ecosystems. */
  dependabot: string[];
}

export interface RepoInfo { owner: string | null; name: string }

export interface PlatformAdapter {
  id: "github";
  communityFiles(ctx: ModuleContext): Output[];
  dependencyUpdates(ecosystems: string[]): Output[];
}

export interface ModuleContext {
  config: RepokitConfig;
  stacks: ResolvedStack[];
  platform: PlatformAdapter;
  repo: RepoInfo;
}

export interface Module {
  id: string;
  enabled(config: RepokitConfig): boolean;
  outputs(ctx: ModuleContext): Output[];
}
```

`src/git.ts`:
```ts
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

/** Paths among `paths` with uncommitted changes, including untracked files. Empty outside git. */
export async function dirtyPaths(root: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0 || !(await isGitRepo(root))) return [];
  const out = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...paths]);
  if (!out) return [];
  const tokens = out.split("\0").filter(Boolean);
  const dirty: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    dirty.push(token.slice(3));
    if (token.startsWith("R") || token.startsWith("C")) i++;
  }
  return dirty;
}
```

`src/stacks/types.ts`:
```ts
import type { StackId } from "../config/types.js";
import type { ResolvedStack } from "../model.js";

export interface StackPack {
  id: StackId;
  /** Files whose presence at the repository root selects this pack. */
  detect: string[];
  /** Reads the repository to decide concrete commands. The only stack code that touches disk. */
  resolve(root: string): Promise<ResolvedStack>;
}
```

`src/stacks/node.ts`:
```ts
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UsageError } from "../errors.js";
import type { StagedJob } from "../model.js";
import type { StackPack } from "./types.js";

const NPM_PLACEHOLDER_TEST = 'echo "Error: no test specified" && exit 1';

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export const nodeStack: StackPack = {
  id: "node",
  detect: ["package.json"],
  async resolve(root) {
    let pkg: PackageJson;
    try {
      pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageJson;
    } catch (error) {
      throw new UsageError(`package.json could not be read: ${(error as Error).message}`);
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const pm = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : "npm";

    const staged: StagedJob[] = [];
    if (deps["@biomejs/biome"]) {
      staged.push({
        name: "node:biome",
        glob: "*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc,css}",
        run: "npx biome check --write --no-errors-on-unmatched {staged_files}",
      });
    } else {
      if (deps.prettier) {
        staged.push({
          name: "node:prettier",
          glob: "*.{js,jsx,ts,tsx,mjs,cjs,json,css,scss,md,yml,yaml,html}",
          run: "npx prettier --write --ignore-unknown {staged_files}",
        });
      }
      if (deps.eslint) {
        staged.push({ name: "node:eslint", glob: "*.{js,jsx,ts,tsx,mjs,cjs}", run: "npx eslint --fix {staged_files}" });
      }
    }

    const testScript = pkg.scripts?.test;
    return {
      id: "node",
      staged,
      test: testScript && testScript !== NPM_PLACEHOLDER_TEST ? `${pm} test` : null,
      install: `${pm} install`,
      gitignore: ["Node"],
      dependabot: ["npm"],
    };
  },
};
```

`src/stacks/index.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/git.test.ts test/stacks.test.ts && npm run typecheck`
Expected: 9 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/model.ts src/git.ts src/stacks test/git.test.ts test/stacks.test.ts
git commit -m "feat(stacks): add the output model, git helpers and the node stack pack"
```

---

### Task 5: GitHub platform adapter, health and deps modules

**Files:**
- Create: `src/templates.ts`, `templates/CODE_OF_CONDUCT.md`, `src/platforms/github.ts`, `src/modules/health.ts`, `src/modules/deps.ts`, `test/modules-health-deps.test.ts`
- Modify: `test/helpers.ts` (append `makeContext`)

**Interfaces:**
- Consumes: model types (Task 4), `defaultConfig` (Task 2), `normalizeEol` (Task 3).
- Produces: `readTemplate(relativePath): string`; `githubPlatform: PlatformAdapter`; `healthModule: Module`; `depsModule: Module`; test helper `makeContext(overrides?)`.

- [ ] **Step 1: Vendor the Contributor Covenant**

```bash
curl -fsSL https://raw.githubusercontent.com/EthicalSource/contributor_covenant/release/content/version/2/1/code_of_conduct.md -o templates/CODE_OF_CONDUCT.md
grep -c "\[INSERT CONTACT METHOD\]" templates/CODE_OF_CONDUCT.md
```
Expected: the file starts with `# Contributor Covenant Code of Conduct` and the count is `1`. If the URL has moved, take the 2.1 Markdown from https://www.contributor-covenant.org/version/2/1/code_of_conduct/ and keep the `[INSERT CONTACT METHOD]` placeholder unchanged.

- [ ] **Step 2: Add the context helper and write the failing test**

Append to `test/helpers.ts`:
```ts
import { defaultConfig, type ModulesConfig, type RepokitConfig } from "../src/config/types.js";
import type { ModuleContext, RepoInfo, ResolvedStack } from "../src/model.js";
import { githubPlatform } from "../src/platforms/github.js";

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
  overrides: { config?: Partial<RepokitConfig>; modules?: Partial<ModulesConfig>; stacks?: ResolvedStack[]; repo?: RepoInfo } = {},
): ModuleContext {
  const base = defaultConfig({
    stacks: ["node"],
    standard: "1.0.0",
    copyright: "2026 Van Nguyen",
    contact: "https://github.com/vannt-dev",
    codeowners: ["@vannt-dev"],
  });
  const config: RepokitConfig = { ...base, ...overrides.config, modules: { ...base.modules, ...overrides.modules } };
  return {
    config,
    stacks: overrides.stacks ?? [nodeResolved()],
    platform: githubPlatform,
    repo: overrides.repo ?? { owner: "vannt-dev", name: "example" },
  };
}
```

`test/modules-health-deps.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { FileOutput } from "../src/model.js";
import { depsModule } from "../src/modules/deps.js";
import { healthModule } from "../src/modules/health.js";
import { makeContext } from "./helpers.js";

const files = (outputs: ReturnType<typeof healthModule.outputs>) =>
  Object.fromEntries(outputs.map((o) => [o.path, (o as FileOutput).content]));

describe("health", () => {
  it("writes the community health files", () => {
    const out = files(healthModule.outputs(makeContext()));
    expect(Object.keys(out).sort()).toEqual([
      ".github/CODEOWNERS",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/config.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/pull_request_template.md",
      "CODE_OF_CONDUCT.md",
      "CONTRIBUTING.md",
      "LICENSE",
      "SECURITY.md",
    ]);
    expect(out.LICENSE).toContain("Copyright (c) 2026 Van Nguyen");
    expect(out["CODE_OF_CONDUCT.md"]).toContain("https://github.com/vannt-dev");
    expect(out["CODE_OF_CONDUCT.md"]).not.toContain("[INSERT CONTACT METHOD]");
    expect(out["SECURITY.md"]).toContain("https://github.com/vannt-dev/example/security/advisories/new");
    expect(out["CONTRIBUTING.md"]).toContain("`npm install`");
    expect(out[".github/CODEOWNERS"]).toContain("* @vannt-dev");
    for (const path of Object.keys(out).filter((p) => p.endsWith(".yml"))) expect(() => parse(out[path] as string)).not.toThrow();
  });

  it("omits CODEOWNERS and the advisory link when the owner is unknown", () => {
    const ctx = makeContext({
      repo: { owner: null, name: "x" },
      modules: { health: { license: "MIT", copyright: "2026 A", contact: "a@example.com", codeowners: [] } },
    });
    const out = files(healthModule.outputs(ctx));
    expect(out[".github/CODEOWNERS"]).toBeUndefined();
    expect(out["SECURITY.md"]).toContain("Security tab");
    expect(parse(out[".github/ISSUE_TEMPLATE/config.yml"] as string).contact_links).toEqual([]);
  });

  it("leaves licensing alone when license is false and rejects unbundled licenses", () => {
    const off = makeContext({ modules: { health: { license: false, copyright: "x", contact: "x", codeowners: [] } } });
    expect(files(healthModule.outputs(off)).LICENSE).toBeUndefined();
    const apache = makeContext({ modules: { health: { license: "Apache-2.0", copyright: "x", contact: "x", codeowners: [] } } });
    expect(() => healthModule.outputs(apache)).toThrow(/Apache-2.0/);
  });

  it("is disabled when modules.health is false", () => {
    expect(healthModule.enabled(makeContext({ modules: { health: false } }).config)).toBe(false);
  });
});

describe("deps", () => {
  it("configures weekly grouped updates for each ecosystem plus GitHub Actions", () => {
    const [output] = depsModule.outputs(makeContext());
    expect(output?.path).toBe(".github/dependabot.yml");
    const config = parse((output as FileOutput).content);
    expect(config.version).toBe(2);
    expect(config.updates.map((u: { "package-ecosystem": string }) => u["package-ecosystem"])).toEqual(["npm", "github-actions"]);
    expect(config.updates[0].schedule).toEqual({ interval: "weekly" });
    expect(config.updates[0].groups["npm-minor-and-patch"]["update-types"]).toEqual(["minor", "patch"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/modules-health-deps.test.ts`
Expected: FAIL — cannot resolve `../src/platforms/github.js`.

- [ ] **Step 4: Write the implementation**

`src/templates.ts`:
```ts
import { readFileSync } from "node:fs";
import { normalizeEol } from "./sync/hash.js";

/** Reads a bundled template with LF endings; works from src/ (tests) and dist/ (package). */
export function readTemplate(relativePath: string): string {
  return normalizeEol(readFileSync(new URL(`../templates/${relativePath}`, import.meta.url), "utf8"));
}
```

`src/platforms/github.ts`:
```ts
import { stringify } from "yaml";
import { MANAGED_HEADER, type ModuleContext, type Output, type PlatformAdapter } from "../model.js";

const yamlFile = (module: string, path: string, data: unknown): Output => ({
  kind: "file",
  module,
  path,
  content: `# ${MANAGED_HEADER}\n${stringify(data)}`,
});

export const githubPlatform: PlatformAdapter = {
  id: "github",

  communityFiles(ctx: ModuleContext): Output[] {
    const { owner, name } = ctx.repo;
    const outputs: Output[] = [
      yamlFile("health", ".github/ISSUE_TEMPLATE/bug_report.yml", {
        name: "Bug report",
        description: "Report something that does not work as expected",
        labels: ["bug"],
        body: [
          {
            type: "textarea",
            id: "what-happened",
            attributes: { label: "What happened?", description: "Include the steps to reproduce it." },
            validations: { required: true },
          },
          { type: "textarea", id: "expected", attributes: { label: "What did you expect?" }, validations: { required: true } },
          { type: "input", id: "version", attributes: { label: "Version" } },
        ],
      }),
      yamlFile("health", ".github/ISSUE_TEMPLATE/feature_request.yml", {
        name: "Feature request",
        description: "Suggest an improvement",
        labels: ["enhancement"],
        body: [
          { type: "textarea", id: "problem", attributes: { label: "What problem would this solve?" }, validations: { required: true } },
          { type: "textarea", id: "proposal", attributes: { label: "What do you propose?" } },
        ],
      }),
      yamlFile("health", ".github/ISSUE_TEMPLATE/config.yml", {
        blank_issues_enabled: false,
        contact_links: owner
          ? [
              {
                name: "Report a security vulnerability",
                url: `https://github.com/${owner}/${name}/security/advisories/new`,
                about: "Please report vulnerabilities privately.",
              },
            ]
          : [],
      }),
      {
        kind: "file",
        module: "health",
        path: ".github/pull_request_template.md",
        content: `<!-- ${MANAGED_HEADER} -->\n\n## Summary\n\n## Testing\n\n- [ ] Tests added or updated\n- [ ] Commit messages follow Conventional Commits\n`,
      },
    ];
    const health = ctx.config.modules.health;
    if (health && health.codeowners.length > 0) {
      outputs.push({
        kind: "file",
        module: "health",
        path: ".github/CODEOWNERS",
        content: `# ${MANAGED_HEADER}\n* ${health.codeowners.join(" ")}\n`,
      });
    }
    return outputs;
  },

  dependencyUpdates(ecosystems: string[]): Output[] {
    const updates = [...new Set([...ecosystems, "github-actions"])].map((ecosystem) => ({
      "package-ecosystem": ecosystem,
      directory: "/",
      schedule: { interval: "weekly" },
      groups: { [`${ecosystem}-minor-and-patch`]: { "update-types": ["minor", "patch"] } },
    }));
    return [yamlFile("deps", ".github/dependabot.yml", { version: 2, updates })];
  },
};
```

`src/modules/health.ts`:
```ts
import { UsageError } from "../errors.js";
import { MANAGED_HEADER, type Module, type Output } from "../model.js";
import { readTemplate } from "../templates.js";

const MIT = (holder: string) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const md = (path: string, content: string): Output => ({ kind: "file", module: "health", path, content });

export const healthModule: Module = {
  id: "health",
  enabled: (config) => config.modules.health !== false,
  outputs(ctx) {
    const health = ctx.config.modules.health;
    if (!health) return [];
    const { owner, name } = ctx.repo;
    const outputs: Output[] = [];

    if (health.license !== false) {
      if (health.license !== "MIT") {
        throw new UsageError(
          `license ${health.license} is not bundled with this version of repokit; use MIT, or set modules.health.license to false`,
        );
      }
      outputs.push(md("LICENSE", MIT(health.copyright)));
    }

    const report = owner
      ? `through [GitHub security advisories](https://github.com/${owner}/${name}/security/advisories/new)`
      : "through the repository's Security tab (Report a vulnerability)";
    outputs.push(
      md(
        "SECURITY.md",
        `# Security Policy\n\n<!-- ${MANAGED_HEADER} -->\n\n## Supported versions\n\nSecurity fixes are released for the latest published version.\n\n## Reporting a vulnerability\n\nPlease do not open a public issue. Report the vulnerability privately ${report}.\nThe maintainers will acknowledge it as soon as possible and keep you informed until it is resolved.\n`,
      ),
    );

    const install = ctx.stacks.map((s) => s.install).filter((c): c is string => c !== null);
    const setup = install.length
      ? `Run ${install.map((c) => `\`${c}\``).join(" and ")}. Installing the dependencies also installs the git hooks (lefthook).`
      : "Install lefthook to enable the git hooks: https://lefthook.dev.";
    outputs.push(
      md(
        "CONTRIBUTING.md",
        `# Contributing\n\n<!-- ${MANAGED_HEADER} -->\n\nThanks for helping improve this project.\n\n## Local setup\n\n${setup}\n\n## Workflow\n\n1. Create a branch from \`main\`.\n2. Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) form, for example \`feat: add export button\` or \`fix(api): handle empty input\`. The \`commit-msg\` hook checks them.\n3. Open a pull request. It is merged once the checks pass and it has been reviewed.\n\nPlease follow the [Code of Conduct](CODE_OF_CONDUCT.md).\n`,
      ),
    );

    outputs.push(md("CODE_OF_CONDUCT.md", readTemplate("CODE_OF_CONDUCT.md").replace("[INSERT CONTACT METHOD]", health.contact)));
    outputs.push(...ctx.platform.communityFiles(ctx));
    return outputs;
  },
};
```

`src/modules/deps.ts`:
```ts
import type { Module } from "../model.js";

export const depsModule: Module = {
  id: "deps",
  enabled: (config) => config.modules.deps,
  outputs: (ctx) => ctx.platform.dependencyUpdates(ctx.stacks.flatMap((s) => s.dependabot)),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/modules-health-deps.test.ts && npm run typecheck`
Expected: 5 tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/templates.ts templates/CODE_OF_CONDUCT.md src/platforms src/modules/health.ts src/modules/deps.ts test/helpers.ts test/modules-health-deps.test.ts
git commit -m "feat(modules): add community health files and Dependabot through the GitHub adapter"
```

---

### Task 6: editorconfig, gitignore, commits and hooks modules

**Files:**
- Create: `templates/gitignore/Node.gitignore`, `src/modules/editorconfig.ts`, `src/modules/gitignore.ts`, `src/modules/commits.ts`, `src/modules/hooks.ts`, `test/modules-core.test.ts`

**Interfaces:**
- Consumes: model types (Task 4), `readTemplate` (Task 5), `TOOL_VERSIONS` (Task 1), `makeContext`/`nodeResolved` (Task 5).
- Produces: `editorconfigModule`, `gitignoreModule`, `commitsModule`, `hooksModule` (all `Module`).

- [ ] **Step 1: Vendor the Node gitignore template**

```bash
mkdir -p templates/gitignore
curl -fsSL https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore -o templates/gitignore/Node.gitignore
head -3 templates/gitignore/Node.gitignore
```
Expected: the file begins with `# Logs`.

- [ ] **Step 2: Write the failing test**

`test/modules-core.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { BlockOutput, FileOutput, JsonOutput } from "../src/model.js";
import { commitsModule } from "../src/modules/commits.js";
import { editorconfigModule } from "../src/modules/editorconfig.js";
import { gitignoreModule } from "../src/modules/gitignore.js";
import { hooksModule } from "../src/modules/hooks.js";
import { makeContext, nodeResolved } from "./helpers.js";

describe("editorconfig", () => {
  it("writes .editorconfig and a .gitattributes block that keeps CRLF for Windows scripts", () => {
    const [config, attributes] = editorconfigModule.outputs(makeContext()) as [FileOutput, BlockOutput];
    expect(config.path).toBe(".editorconfig");
    expect(config.content).toContain("root = true");
    expect(config.content).toContain("end_of_line = lf");
    expect(attributes).toMatchObject({ kind: "block", path: ".gitattributes", id: "editorconfig", comment: "hash" });
    expect(attributes.body).toContain("* text=auto eol=lf");
    expect(attributes.body).toContain("*.{ps1,psm1,bat,cmd} text eol=crlf");
  });
});

describe("gitignore", () => {
  it("adds the stack templates and ignores repokit's conflict files", () => {
    const [block] = gitignoreModule.outputs(makeContext()) as [BlockOutput];
    expect(block).toMatchObject({ kind: "block", path: ".gitignore", id: "gitignore" });
    expect(block.body).toContain("## Node (github/gitignore)");
    expect(block.body).toContain("node_modules/");
    expect(block.body.endsWith("*.repokit-new")).toBe(true);
  });
});

describe("commits", () => {
  it("configures commitlint and adds its packages for node", () => {
    const outputs = commitsModule.outputs(makeContext());
    const config = outputs.find((o) => o.kind === "file") as FileOutput;
    expect(config.path).toBe("commitlint.config.mjs");
    expect(config.content).toContain('extends: ["@commitlint/config-conventional"]');
    expect(config.content).toContain('"header-max-length": [2, "always", 100]');
    const json = outputs.filter((o): o is JsonOutput => o.kind === "json");
    expect(json.map((o) => [o.keyPath.join("."), o.value])).toEqual([
      ["devDependencies.@commitlint/cli", "^21.2.3"],
      ["devDependencies.@commitlint/config-conventional", "^21.2.3"],
    ]);
  });
});

describe("hooks", () => {
  it("runs staged-file jobs, commitlint and tests", () => {
    const outputs = hooksModule.outputs(makeContext());
    const file = outputs.find((o) => o.kind === "file") as FileOutput;
    expect(file.path).toBe("lefthook.yml");
    const config = parse(file.content);
    expect(config["pre-commit"]).toEqual({
      parallel: true,
      jobs: [{ name: "node:prettier", glob: "*.{js,ts}", run: "npx prettier --write --ignore-unknown {staged_files}", stage_fixed: true }],
    });
    expect(config["commit-msg"]).toEqual({ jobs: [{ name: "commitlint", run: "npx --no-install commitlint --edit {1}" }] });
    expect(config["pre-push"]).toEqual({ jobs: [{ name: "node:test", run: "npm test" }] });
    const json = outputs.find((o) => o.kind === "json") as JsonOutput;
    expect([json.keyPath.join("."), json.value]).toEqual(["devDependencies.lefthook", "^2.1.14"]);
  });

  it("drops hooks that have nothing to run", () => {
    const ctx = makeContext({ modules: { commits: false }, stacks: [nodeResolved({ staged: [], test: null })] });
    const file = hooksModule.outputs(ctx).find((o) => o.kind === "file") as FileOutput;
    expect(parse(file.content)).toEqual({});
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/modules-core.test.ts`
Expected: FAIL — cannot resolve `../src/modules/commits.js`.

- [ ] **Step 4: Write the implementation**

`src/modules/editorconfig.ts`:
```ts
import { MANAGED_HEADER, type Module } from "../model.js";

const EDITORCONFIG = `# ${MANAGED_HEADER}
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{ps1,psm1,bat,cmd}]
end_of_line = crlf

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;

const GITATTRIBUTES = [
  "* text=auto eol=lf",
  "*.{ps1,psm1,bat,cmd} text eol=crlf",
  "*.{png,jpg,jpeg,gif,ico,webp,pdf,zip,gz,woff,woff2} binary",
].join("\n");

export const editorconfigModule: Module = {
  id: "editorconfig",
  enabled: (config) => config.modules.editorconfig,
  outputs: () => [
    { kind: "file", module: "editorconfig", path: ".editorconfig", content: EDITORCONFIG },
    { kind: "block", module: "editorconfig", path: ".gitattributes", id: "editorconfig", comment: "hash", body: GITATTRIBUTES },
  ],
};
```

`src/modules/gitignore.ts`:
```ts
import type { Module } from "../model.js";
import { readTemplate } from "../templates.js";

export const gitignoreModule: Module = {
  id: "gitignore",
  enabled: (config) => config.modules.gitignore,
  outputs(ctx) {
    const names = [...new Set(ctx.stacks.flatMap((s) => s.gitignore))];
    const sections = names.map((n) => `## ${n} (github/gitignore)\n${readTemplate(`gitignore/${n}.gitignore`).trim()}`);
    sections.push("## repokit\n*.repokit-new");
    return [{ kind: "block", module: "gitignore", path: ".gitignore", id: "gitignore", comment: "hash", body: sections.join("\n\n") }];
  },
};
```

`src/modules/commits.ts`:
```ts
import { MANAGED_HEADER, type Module, type Output } from "../model.js";
import { TOOL_VERSIONS } from "../version.js";

const COMMITLINT_CONFIG = `// ${MANAGED_HEADER}
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
  },
};
`;

export const commitsModule: Module = {
  id: "commits",
  enabled: (config) => config.modules.commits,
  outputs(ctx) {
    const outputs: Output[] = [{ kind: "file", module: "commits", path: "commitlint.config.mjs", content: COMMITLINT_CONFIG }];
    if (ctx.stacks.some((s) => s.id === "node")) {
      outputs.push(
        { kind: "json", module: "commits", path: "package.json", keyPath: ["devDependencies", "@commitlint/cli"], value: `^${TOOL_VERSIONS.commitlintCli}` },
        {
          kind: "json",
          module: "commits",
          path: "package.json",
          keyPath: ["devDependencies", "@commitlint/config-conventional"],
          value: `^${TOOL_VERSIONS.commitlintConventional}`,
        },
      );
    }
    return outputs;
  },
};
```

`src/modules/hooks.ts`:
```ts
import { stringify } from "yaml";
import { MANAGED_HEADER, type Module, type Output } from "../model.js";
import { TOOL_VERSIONS } from "../version.js";

export const hooksModule: Module = {
  id: "hooks",
  enabled: (config) => config.modules.hooks,
  outputs(ctx) {
    const config: Record<string, unknown> = {};
    const preCommit = ctx.stacks.flatMap((s) => s.staged).map((job) => ({ ...job, stage_fixed: true }));
    if (preCommit.length > 0) config["pre-commit"] = { parallel: true, jobs: preCommit };
    if (ctx.config.modules.commits) {
      config["commit-msg"] = { jobs: [{ name: "commitlint", run: "npx --no-install commitlint --edit {1}" }] };
    }
    const prePush = ctx.stacks.flatMap((s) => (s.test ? [{ name: `${s.id}:test`, run: s.test }] : []));
    if (prePush.length > 0) config["pre-push"] = { jobs: prePush };

    const outputs: Output[] = [
      { kind: "file", module: "hooks", path: "lefthook.yml", content: `# ${MANAGED_HEADER}\n${stringify(config)}` },
    ];
    if (ctx.stacks.some((s) => s.id === "node")) {
      outputs.push({ kind: "json", module: "hooks", path: "package.json", keyPath: ["devDependencies", "lefthook"], value: `^${TOOL_VERSIONS.lefthook}` });
    }
    return outputs;
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/modules-core.test.ts && npm run typecheck`
Expected: 6 tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add templates/gitignore src/modules/editorconfig.ts src/modules/gitignore.ts src/modules/commits.ts src/modules/hooks.ts test/modules-core.test.ts
git commit -m "feat(modules): add editorconfig, gitignore, commitlint and lefthook modules"
```

---

### Task 7: Planner

**Files:**
- Create: `src/modules/index.ts`, `src/plan.ts`, `test/plan.test.ts`

**Interfaces:**
- Consumes: all modules (Tasks 5–6), `outputId` (Task 4).
- Produces: `MODULES: Module[]`; `planOutputs(ctx: ModuleContext, modules?: Module[]): Output[]` — sorted by `outputId`, `owned` paths removed, throws on duplicate ids.

- [ ] **Step 1: Write the failing test**

`test/plan.test.ts`:
```ts
import { expect, it } from "vitest";
import { type Module, outputId } from "../src/model.js";
import { planOutputs } from "../src/plan.js";
import { makeContext } from "./helpers.js";

const paths = (ctx = makeContext()) => [...new Set(planOutputs(ctx).map((o) => o.path))].sort();

it("plans every core output for a node repository", () => {
  expect(paths()).toEqual([
    ".editorconfig",
    ".gitattributes",
    ".github/CODEOWNERS",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/dependabot.yml",
    ".github/pull_request_template.md",
    ".gitignore",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "SECURITY.md",
    "commitlint.config.mjs",
    "lefthook.yml",
    "package.json",
  ]);
});

it("is sorted and deterministic", () => {
  const ids = planOutputs(makeContext()).map(outputId);
  expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  expect(planOutputs(makeContext())).toEqual(planOutputs(makeContext()));
});

it("drops disabled modules", () => {
  const ctx = makeContext({ modules: { hooks: false, deps: false, health: false } });
  expect(paths(ctx)).not.toContain("lefthook.yml");
  expect(paths(ctx)).not.toContain(".github/dependabot.yml");
  expect(paths(ctx)).not.toContain("LICENSE");
});

it("leaves owned paths alone, including Windows-style entries", () => {
  const ctx = makeContext({ config: { owned: ["LICENSE", ".github\\CODEOWNERS"] } });
  expect(paths(ctx)).not.toContain("LICENSE");
  expect(paths(ctx)).not.toContain(".github/CODEOWNERS");
});

it("refuses two modules producing the same output", () => {
  const twin: Module = {
    id: "twin",
    enabled: () => true,
    outputs: () => [{ kind: "file", module: "twin", path: "a.txt", content: "a" }],
  };
  expect(() => planOutputs(makeContext(), [twin, twin])).toThrow("file:a.txt");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/plan.test.ts`
Expected: FAIL — cannot resolve `../src/plan.js`.

- [ ] **Step 3: Write the implementation**

`src/modules/index.ts`:
```ts
import type { Module } from "../model.js";
import { commitsModule } from "./commits.js";
import { depsModule } from "./deps.js";
import { editorconfigModule } from "./editorconfig.js";
import { gitignoreModule } from "./gitignore.js";
import { healthModule } from "./health.js";
import { hooksModule } from "./hooks.js";

/** `ci` and `release` join this list in the reusable-workflows plan. */
export const MODULES: Module[] = [editorconfigModule, gitignoreModule, commitsModule, hooksModule, healthModule, depsModule];
```

`src/plan.ts`:
```ts
import { type Module, type ModuleContext, type Output, outputId } from "./model.js";
import { MODULES } from "./modules/index.js";

const toPosix = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "");

/** Pure: the outputs the standard asks for, given the config and resolved stacks. */
export function planOutputs(ctx: ModuleContext, modules: Module[] = MODULES): Output[] {
  const owned = new Set(ctx.config.owned.map(toPosix));
  const outputs = modules
    .filter((module) => module.enabled(ctx.config))
    .flatMap((module) => module.outputs(ctx))
    .filter((output) => !owned.has(output.path));
  const seen = new Set<string>();
  for (const output of outputs) {
    const id = outputId(output);
    if (seen.has(id)) throw new Error(`two modules produce ${id}`);
    seen.add(id);
  }
  return outputs.sort((a, b) => outputId(a).localeCompare(outputId(b)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/plan.test.ts && npm run typecheck`
Expected: 5 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/modules/index.ts src/plan.ts test/plan.test.ts
git commit -m "feat(plan): combine enabled modules into one deterministic output list"
```

---

### Task 8: Lock file, current state and the decision table

**Files:**
- Create: `src/sync/lock.ts`, `src/sync/state.ts`, `src/sync/decide.ts`, `test/decide.test.ts`

**Interfaces:**
- Consumes: `Output`, `outputId` (Task 4); block/json/hash helpers (Task 3); `LockError`, `UsageError` (Task 1).
- Produces:
  - `LOCK_FILE = ".repokit/lock.json"`
  - `type Target = { kind: "file"; path: string } | { kind: "block"; path: string; id: string; comment: CommentStyle } | { kind: "json"; path: string; keyPath: string[] }`; `targetOf(output): Target`
  - `interface LockEntry { id: string; module: string; hash: string; target: Target }`; `interface Lock { lockVersion: 1; standard: string; entries: LockEntry[] }`; `readLock(root): Promise<Lock | null>`; `writeLock(root, lock): Promise<void>`
  - `desiredText(output): string`; `readCurrent(root, target): Promise<string | null>`
  - `type Action = "create" | "write" | "adopt" | "unchanged" | "conflict" | "unmanaged"`; `decide(output, currentText, entry, adopt: boolean): Action`
  - `type RemovalAction = "delete" | "orphan-edited" | "gone"`; `decideRemoval(entry, currentText): RemovalAction`

- [ ] **Step 1: Write the failing test**

`test/decide.test.ts`:
```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LockError } from "../src/errors.js";
import type { Output } from "../src/model.js";
import { decide, decideRemoval } from "../src/sync/decide.js";
import { hashText } from "../src/sync/hash.js";
import { LOCK_FILE, type LockEntry, readLock, targetOf, writeLock } from "../src/sync/lock.js";
import { desiredText, readCurrent } from "../src/sync/state.js";
import { tempDir } from "./helpers.js";

const file: Output = { kind: "file", module: "m", path: "a.txt", content: "new\n" };
const entry = (text: string): LockEntry => ({ id: "file:a.txt", module: "m", hash: hashText(text), target: targetOf(file) });

describe("decide", () => {
  it("creates what is missing", () => expect(decide(file, null, undefined, false)).toBe("create"));
  it("leaves matching content alone", () => expect(decide(file, "new\n", entry("old\n"), false)).toBe("unchanged"));
  it("treats a CRLF checkout of the same content as unchanged", () =>
    expect(decide(file, "new\r\n", entry("new\n"), false)).toBe("unchanged"));
  it("writes over content repokit wrote earlier", () => expect(decide(file, "old\n", entry("old\n"), false)).toBe("write"));
  it("flags content the user edited", () => expect(decide(file, "mine\n", entry("old\n"), false)).toBe("conflict"));
  it("does not take over an existing file", () => expect(decide(file, "mine\n", undefined, false)).toBe("unmanaged"));
  it("takes over an existing file when adopted", () => expect(decide(file, "mine\n", undefined, true)).toBe("adopt"));
});

describe("decideRemoval", () => {
  it("deletes untouched output", () => expect(decideRemoval(entry("old\n"), "old\n")).toBe("delete"));
  it("keeps edited output", () => expect(decideRemoval(entry("old\n"), "mine\n")).toBe("orphan-edited"));
  it("notes output that is already gone", () => expect(decideRemoval(entry("old\n"), null)).toBe("gone"));
});

describe("state", () => {
  it("reads files, blocks and JSON keys as comparable text", async () => {
    const root = await tempDir();
    await writeFile(join(root, "a.txt"), "hello\n");
    await writeFile(join(root, ".gitignore"), "x\n\n# repokit:start g\ndist/\n# repokit:end g\n");
    await writeFile(join(root, "package.json"), '{ "devDependencies": { "lefthook": "^2.1.14" } }');
    expect(await readCurrent(root, { kind: "file", path: "a.txt" })).toBe("hello\n");
    expect(await readCurrent(root, { kind: "file", path: "missing.txt" })).toBeNull();
    expect(await readCurrent(root, { kind: "block", path: ".gitignore", id: "g", comment: "hash" })).toBe("dist/");
    expect(await readCurrent(root, { kind: "json", path: "package.json", keyPath: ["devDependencies", "lefthook"] })).toBe(
      '"^2.1.14"',
    );
    expect(await readCurrent(root, { kind: "json", path: "package.json", keyPath: ["scripts", "x"] })).toBeNull();
    expect(desiredText({ kind: "json", module: "m", path: "package.json", keyPath: ["a"], value: "^1" })).toBe('"^1"');
  });
});

describe("lock", () => {
  it("round-trips and reports a missing lock as null", async () => {
    const root = await tempDir();
    expect(await readLock(root)).toBeNull();
    const lock = { lockVersion: 1 as const, standard: "1.0.0", entries: [entry("x")] };
    await writeLock(root, lock);
    expect(await readLock(root)).toEqual(lock);
  });

  it("rejects a corrupt lock with a hint", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".repokit"));
    await writeFile(join(root, LOCK_FILE), "{ nope");
    await expect(readLock(root)).rejects.toThrow(LockError);
    await expect(readLock(root)).rejects.toThrow("repokit init --relock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/decide.test.ts`
Expected: FAIL — cannot resolve `../src/sync/decide.js`.

- [ ] **Step 3: Write the implementation**

`src/sync/lock.ts`:
```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LockError } from "../errors.js";
import type { Output } from "../model.js";
import type { CommentStyle } from "./block.js";

export const LOCK_FILE = ".repokit/lock.json";

export type Target =
  | { kind: "file"; path: string }
  | { kind: "block"; path: string; id: string; comment: CommentStyle }
  | { kind: "json"; path: string; keyPath: string[] };

export function targetOf(output: Output): Target {
  if (output.kind === "file") return { kind: "file", path: output.path };
  if (output.kind === "block") return { kind: "block", path: output.path, id: output.id, comment: output.comment };
  return { kind: "json", path: output.path, keyPath: output.keyPath };
}

export interface LockEntry {
  id: string;
  module: string;
  /** Hash of the content repokit last wrote (see desiredText). */
  hash: string;
  target: Target;
}

export interface Lock {
  lockVersion: 1;
  standard: string;
  entries: LockEntry[];
}

export async function readLock(root: string): Promise<Lock | null> {
  let text: string;
  try {
    text = await readFile(join(root, LOCK_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const data = JSON.parse(text) as Lock;
    if (data.lockVersion !== 1 || !Array.isArray(data.entries)) throw new Error("unexpected format");
    return data;
  } catch (error) {
    throw new LockError(`${LOCK_FILE} is unreadable (${(error as Error).message}); run \`repokit init --relock\``);
  }
}

export async function writeLock(root: string, lock: Lock): Promise<void> {
  const path = join(root, LOCK_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`);
}
```

`src/sync/state.ts`:
```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UsageError } from "../errors.js";
import type { Output } from "../model.js";
import { readBlock } from "./block.js";
import { getAtPath } from "./json.js";
import type { Target } from "./lock.js";

/** The text repokit compares and hashes for an output. */
export function desiredText(output: Output): string {
  if (output.kind === "file") return output.content;
  if (output.kind === "block") return output.body;
  return JSON.stringify(output.value);
}

async function readText(root: string, path: string): Promise<string | null> {
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The same comparable text read from disk, or null when absent. */
export async function readCurrent(root: string, target: Target): Promise<string | null> {
  const text = await readText(root, target.path);
  if (text === null) return null;
  if (target.kind === "file") return text;
  if (target.kind === "block") return readBlock(text, target.id, target.comment);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${target.path} is not valid JSON: ${(error as Error).message}`);
  }
  const value = getAtPath(data, target.keyPath);
  return value === undefined ? null : JSON.stringify(value);
}
```

`src/sync/decide.ts`:
```ts
import type { Output } from "../model.js";
import { hashText } from "./hash.js";
import type { LockEntry } from "./lock.js";
import { desiredText } from "./state.js";

export type Action = "create" | "write" | "adopt" | "unchanged" | "conflict" | "unmanaged";
export type RemovalAction = "delete" | "orphan-edited" | "gone";

/** The update decision table from the spec, section 7. */
export function decide(output: Output, currentText: string | null, entry: LockEntry | undefined, adopt: boolean): Action {
  if (currentText === null) return "create";
  const current = hashText(currentText);
  if (current === hashText(desiredText(output))) return "unchanged";
  if (entry) return current === entry.hash ? "write" : "conflict";
  return adopt ? "adopt" : "unmanaged";
}

/** For a lock entry the standard no longer produces. */
export function decideRemoval(entry: LockEntry, currentText: string | null): RemovalAction {
  if (currentText === null) return "gone";
  return hashText(currentText) === entry.hash ? "delete" : "orphan-edited";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/decide.test.ts && npm run typecheck`
Expected: 13 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/sync/lock.ts src/sync/state.ts src/sync/decide.ts test/decide.test.ts
git commit -m "feat(sync): add the lock file and the per-output decision table"
```

---

### Task 9: Computing and applying a sync

**Files:**
- Create: `src/sync/sync.ts`, `src/sync/apply.ts`, `test/sync.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4 and 8.
- Produces:
  - `interface Decision { output: Output; action: Action }`; `interface Removal { entry: LockEntry; action: RemovalAction }`; `interface SyncResult { decisions: Decision[]; removals: Removal[] }`
  - `interface SyncOptions { adopt: Set<string> | "all"; accept: Set<string> }`
  - `computeSync(root, outputs, lock: Lock | null, options): Promise<SyncResult>`
  - `pathsToWrite(result): string[]`
  - `applySync(root, result, previous: Lock | null, standard): Promise<Lock>` — writes files and the lock, returns the new lock

- [ ] **Step 1: Write the failing test**

`test/sync.test.ts`:
```ts
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Output } from "../src/model.js";
import { applySync } from "../src/sync/apply.js";
import { readLock } from "../src/sync/lock.js";
import { computeSync, pathsToWrite } from "../src/sync/sync.js";
import { tempDir } from "./helpers.js";

const none = { adopt: new Set<string>(), accept: new Set<string>() };
const v1: Output[] = [
  { kind: "file", module: "a", path: "nested/dir/a.txt", content: "a1\n" },
  { kind: "block", module: "b", path: ".gitignore", id: "b", comment: "hash", body: "dist/" },
  { kind: "json", module: "c", path: "package.json", keyPath: ["devDependencies", "lefthook"], value: "^2.1.14" },
];

async function syncTo(root: string, outputs: Output[], options = none) {
  const lock = await readLock(root);
  const result = await computeSync(root, outputs, lock, options);
  await applySync(root, result, lock, "1.0.0");
  return result;
}

const actions = (result: Awaited<ReturnType<typeof computeSync>>) =>
  Object.fromEntries(result.decisions.map((d) => [d.output.path, d.action]));

describe("sync", () => {
  it("creates outputs, keeps existing content and records the lock", async () => {
    const root = await tempDir();
    await writeFile(join(root, ".gitignore"), "node_modules/");
    await writeFile(join(root, "package.json"), '{\r\n    "name": "x"\r\n}\r\n');
    const result = await syncTo(root, v1);
    expect(actions(result)).toEqual({ "nested/dir/a.txt": "create", ".gitignore": "create", "package.json": "create" });
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(
      "node_modules/\n\n# repokit:start b\ndist/\n# repokit:end b\n",
    );
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(
      '{\r\n    "name": "x",\r\n    "devDependencies": {\r\n        "lefthook": "^2.1.14"\r\n    }\r\n}\r\n',
    );
    expect((await readLock(root))?.entries.map((e) => e.id)).toHaveLength(3);
    expect(pathsToWrite(result).sort()).toEqual([".gitignore", "nested/dir/a.txt", "package.json"]);
  });

  it("updates untouched output and preserves edited output", async () => {
    const root = await tempDir();
    await syncTo(root, v1);
    await writeFile(join(root, "nested/dir/a.txt"), "mine\n");
    const v2: Output[] = [{ ...v1[0], content: "a2\n" } as Output, { ...v1[1], body: "dist/\nbuild/" } as Output, v1[2] as Output];
    const result = await syncTo(root, v2);
    expect(actions(result)).toEqual({ "nested/dir/a.txt": "conflict", ".gitignore": "write", "package.json": "unchanged" });
    expect(await readFile(join(root, "nested/dir/a.txt"), "utf8")).toBe("mine\n");
    expect(await readFile(join(root, "nested/dir/a.txt.repokit-new"), "utf8")).toBe("a2\n");
    // The conflict keeps its old lock entry, so it is still reported next time.
    const again = await computeSync(root, v2, await readLock(root), none);
    expect(actions(again)["nested/dir/a.txt"]).toBe("conflict");
  });

  it("accepts a conflicting file on request", async () => {
    const root = await tempDir();
    await syncTo(root, v1);
    await writeFile(join(root, "nested/dir/a.txt"), "mine\n");
    const v2: Output[] = [{ ...v1[0], content: "a2\n" } as Output];
    const result = await syncTo(root, v2, { adopt: new Set(), accept: new Set(["nested/dir/a.txt"]) });
    expect(actions(result)["nested/dir/a.txt"]).toBe("write");
    expect(await readFile(join(root, "nested/dir/a.txt"), "utf8")).toBe("a2\n");
  });

  it("does not take over existing files unless adopted", async () => {
    const root = await tempDir();
    await writeFile(join(root, "LICENSE"), "custom");
    const license: Output[] = [{ kind: "file", module: "health", path: "LICENSE", content: "MIT\n" }];
    expect(actions(await syncTo(root, license)).LICENSE).toBe("unmanaged");
    expect(await readFile(join(root, "LICENSE"), "utf8")).toBe("custom");
    expect(actions(await syncTo(root, license, { adopt: "all", accept: new Set() })).LICENSE).toBe("adopt");
    expect(await readFile(join(root, "LICENSE"), "utf8")).toBe("MIT\n");
  });

  it("removes output the standard dropped, unless the user edited it", async () => {
    const root = await tempDir();
    await syncTo(root, v1);
    await writeFile(join(root, "package.json"), '{"devDependencies":{"lefthook":"^9"}}');
    const result = await syncTo(root, []);
    expect(Object.fromEntries(result.removals.map((r) => [r.entry.target.path, r.action]))).toEqual({
      "nested/dir/a.txt": "delete",
      ".gitignore": "delete",
      "package.json": "orphan-edited",
    });
    expect(existsSync(join(root, "nested/dir/a.txt"))).toBe(false);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("");
    expect(await readFile(join(root, "package.json"), "utf8")).toContain("^9");
    expect((await readLock(root))?.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sync.test.ts`
Expected: FAIL — cannot resolve `../src/sync/apply.js`.

- [ ] **Step 3: Write the implementation**

`src/sync/sync.ts`:
```ts
import { type Output, outputId } from "../model.js";
import { type Action, type RemovalAction, decide, decideRemoval } from "./decide.js";
import { type Lock, type LockEntry, targetOf } from "./lock.js";
import { readCurrent } from "./state.js";

export interface Decision { output: Output; action: Action }
export interface Removal { entry: LockEntry; action: RemovalAction }
export interface SyncResult { decisions: Decision[]; removals: Removal[] }
export interface SyncOptions { adopt: Set<string> | "all"; accept: Set<string> }

export async function computeSync(root: string, outputs: Output[], lock: Lock | null, options: SyncOptions): Promise<SyncResult> {
  const entries = new Map((lock?.entries ?? []).map((e) => [e.id, e]));
  const decisions: Decision[] = [];
  for (const output of outputs) {
    const adopt = options.adopt === "all" || options.adopt.has(output.path);
    let action = decide(output, await readCurrent(root, targetOf(output)), entries.get(outputId(output)), adopt);
    if (action === "conflict" && options.accept.has(output.path)) action = "write";
    decisions.push({ output, action });
  }
  const wanted = new Set(outputs.map(outputId));
  const removals: Removal[] = [];
  for (const entry of entries.values()) {
    if (!wanted.has(entry.id)) removals.push({ entry, action: decideRemoval(entry, await readCurrent(root, entry.target)) });
  }
  return { decisions, removals };
}

const WRITES: Action[] = ["create", "write", "adopt"];

/** Existing paths a sync would change; guarded against uncommitted edits. */
export function pathsToWrite(result: SyncResult): string[] {
  return [
    ...new Set([
      ...result.decisions.filter((d) => WRITES.includes(d.action)).map((d) => d.output.path),
      ...result.removals.filter((r) => r.action === "delete").map((r) => r.entry.target.path),
    ]),
  ];
}
```

`src/sync/apply.ts`:
```ts
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

export async function applySync(root: string, result: SyncResult, previous: Lock | null, standard: string): Promise<Lock> {
  const previousEntries = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
  const entries: LockEntry[] = [];
  for (const { output, action } of result.decisions) {
    const id = outputId(output);
    if (action === "create" || action === "write" || action === "adopt") await write(root, output);
    if (action === "conflict" && output.kind === "file") await put(join(root, `${output.path}.repokit-new`), output.content);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sync.test.ts && npm run typecheck`
Expected: 5 tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/sync/sync.ts src/sync/apply.ts test/sync.test.ts
git commit -m "feat(sync): compute and apply a sync without overwriting local edits"
```

---

### Task 10: `init`, `check` and `update` commands

**Files:**
- Create: `src/commands/context.ts`, `src/commands/report.ts`, `src/commands/init.ts`, `src/commands/check.ts`, `src/commands/update.ts`, `test/e2e.test.ts`
- Modify: `src/cli.ts` (dispatch the commands)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `interface CommandOptions { dryRun: boolean; force: boolean; adopt: string[]; adoptAll: boolean; accept: string[]; stacks: StackId[]; relock: boolean; json: boolean }`
  - `buildContext(root, config, repo?): Promise<ModuleContext>`
  - `printResult(io, result): void`; `hasDrift(result): boolean`
  - `initCommand(root, options, io): Promise<number>`; `checkCommand(root, options, io): Promise<number>`; `updateCommand(root, options, io): Promise<number>`

- [ ] **Step 1: Write the failing end-to-end test**

`test/e2e.test.ts`:
```ts
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

async function repokit(dir: string, ...args: string[]) {
  const c = capture(dir);
  const code = await run(args, c.io);
  return { code, out: c.out.join("\n"), err: c.err.join("\n") };
}

const commitAll = (dir: string) => {
  sh(dir, "add", "-A");
  sh(dir, "commit", "-qm", "chore: sync");
};

describe("repokit end to end", () => {
  it("initialises, checks clean, detects an edit and resolves it", async () => {
    const dir = await nodeRepo();
    const init = await repokit(dir, "init");
    expect(init.code).toBe(0);
    const config = parse(await readFile(join(dir, ".repokit.yml"), "utf8"));
    expect(config.stacks).toEqual(["node"]);
    expect(config.modules.health.codeowners).toEqual(["@demo-owner"]);
    expect(config.modules.health.copyright).toMatch(/^\d{4} Demo User$/);
    expect(existsSync(join(dir, "lefthook.yml"))).toBe(true);
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf8")).devDependencies.lefthook).toBe("^2.1.14");
    commitAll(dir);

    expect((await repokit(dir, "check")).code).toBe(0);

    await appendFile(join(dir, "lefthook.yml"), "# local tweak\n");
    const drift = await repokit(dir, "check");
    expect(drift.code).toBe(1);
    expect(drift.out).toContain("conflict");
    expect(drift.out).toContain("lefthook.yml");

    const guarded = await repokit(dir, "update", "--accept", "lefthook.yml");
    expect(guarded.code).toBe(2);
    expect(guarded.err).toContain("uncommitted changes in lefthook.yml");

    const accepted = await repokit(dir, "update", "--accept", "lefthook.yml", "--force");
    expect(accepted.code).toBe(0);
    expect(await readFile(join(dir, "lefthook.yml"), "utf8")).not.toContain("local tweak");
    expect((await repokit(dir, "check")).code).toBe(0);
  });

  it("keeps a user-edited file on update and writes the new version beside it", async () => {
    const dir = await nodeRepo();
    await repokit(dir, "init");
    commitAll(dir);
    const lockPath = join(dir, ".repokit/lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    // Pretend repokit last wrote different content, then the user edited the file.
    for (const entry of lock.entries) if (entry.id === "file:lefthook.yml") entry.hash = "0".repeat(64);
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    await appendFile(join(dir, "lefthook.yml"), "# mine\n");
    commitAll(dir);
    const update = await repokit(dir, "update");
    expect(update.code).toBe(1);
    expect(await readFile(join(dir, "lefthook.yml"), "utf8")).toContain("# mine");
    expect(existsSync(join(dir, "lefthook.yml.repokit-new"))).toBe(true);
  });

  it("works outside git and without a remote", async () => {
    const dir = await nodeRepo(false);
    const init = await repokit(dir, "init");
    expect(init.code).toBe(0);
    expect(existsSync(join(dir, ".github/CODEOWNERS"))).toBe(false);
    expect(existsSync(join(dir, "SECURITY.md"))).toBe(true);
  });

  it("does not overwrite existing files unless adopted", async () => {
    const dir = await nodeRepo();
    await writeFile(join(dir, "LICENSE"), "All rights reserved.\n");
    commitAll(dir);
    const init = await repokit(dir, "init");
    expect(init.code).toBe(0);
    expect(init.out).toContain("unmanaged");
    expect(await readFile(join(dir, "LICENSE"), "utf8")).toBe("All rights reserved.\n");
  });

  it("refuses to init twice, reports a missing config and a corrupt lock", async () => {
    const dir = await nodeRepo();
    await repokit(dir, "init");
    expect((await repokit(dir, "init")).code).toBe(2);
    await writeFile(join(dir, ".repokit/lock.json"), "garbage");
    const check = await repokit(dir, "check");
    expect(check.code).toBe(1);
    expect(check.err).toContain("repokit init --relock");
    expect((await repokit(dir, "init", "--relock")).code).toBe(0);
    expect((await repokit(dir, "check")).code).toBe(0);
    expect((await repokit(await tempDir(), "check")).code).toBe(2);
  });

  it("changes nothing on a dry run and prints JSON for check", async () => {
    const dir = await nodeRepo();
    expect((await repokit(dir, "init", "--dry-run")).code).toBe(0);
    expect(existsSync(join(dir, ".repokit.yml"))).toBe(false);
    await repokit(dir, "init");
    const json = await repokit(dir, "check", "--json");
    expect(JSON.parse(json.out)).toMatchObject({ clean: true, standard: { config: "1.0.0", current: "1.0.0" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/e2e.test.ts`
Expected: FAIL — `init` is reported as an unknown command (exit 2 instead of 0).

- [ ] **Step 3: Write the commands**

`src/commands/context.ts`:
```ts
import type { RepokitConfig } from "../config/types.js";
import { repoInfo } from "../git.js";
import type { ModuleContext, RepoInfo } from "../model.js";
import { githubPlatform } from "../platforms/github.js";
import { getStackPack } from "../stacks/index.js";

export async function buildContext(root: string, config: RepokitConfig, repo?: RepoInfo): Promise<ModuleContext> {
  const stacks = await Promise.all(config.stacks.map((id) => getStackPack(id).resolve(root)));
  return { config, stacks, platform: githubPlatform, repo: repo ?? (await repoInfo(root)) };
}
```

`src/commands/report.ts`:
```ts
import type { Io } from "../cli.js";
import { describeOutput } from "../model.js";
import type { SyncResult } from "../sync/sync.js";

export interface CommandOptions {
  dryRun: boolean;
  force: boolean;
  adopt: string[];
  adoptAll: boolean;
  accept: string[];
  stacks: import("../config/types.js").StackId[];
  relock: boolean;
  json: boolean;
}

const HINTS: Record<string, (path: string) => string> = {
  conflict: (p) => `edited locally; take repokit's version with --accept ${p}, or add it to owned in .repokit.yml`,
  unmanaged: (p) => `exists and is not managed; let repokit manage it with --adopt ${p}, or add it to owned`,
};

export function printResult(io: Io, result: SyncResult): void {
  let unchanged = 0;
  for (const { output, action } of result.decisions) {
    if (action === "unchanged") {
      unchanged++;
      continue;
    }
    const hint = HINTS[action]?.(output.path);
    io.out(`${action.padEnd(10)} ${describeOutput(output)}${hint ? ` (${hint})` : ""}`);
  }
  for (const { entry, action } of result.removals) {
    if (action === "gone") continue;
    const label = action === "delete" ? "delete" : "kept";
    const note = action === "delete" ? "" : " (no longer generated, but edited locally; left in place)";
    io.out(`${label.padEnd(10)} ${entry.target.path}${note}`);
  }
  io.out(`${unchanged} output(s) already match the standard`);
}

export function hasDrift(result: SyncResult): boolean {
  return result.decisions.some((d) => d.action !== "unchanged") || result.removals.length > 0;
}
```

`src/commands/init.ts`:
```ts
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Io } from "../cli.js";
import { CONFIG_FILE, loadConfig, renderConfig } from "../config/load.js";
import { defaultConfig } from "../config/types.js";
import { UsageError } from "../errors.js";
import { dirtyPaths, gitUserName, repoInfo } from "../git.js";
import { outputId } from "../model.js";
import { planOutputs } from "../plan.js";
import { detectStacks } from "../stacks/index.js";
import { applySync } from "../sync/apply.js";
import { hashText } from "../sync/hash.js";
import { type Lock, targetOf, writeLock } from "../sync/lock.js";
import { readCurrent } from "../sync/state.js";
import { computeSync, pathsToWrite, type SyncResult } from "../sync/sync.js";
import { STANDARD_VERSION } from "../version.js";
import { buildContext } from "./context.js";
import { type CommandOptions, printResult } from "./report.js";

export async function guardUncommitted(root: string, result: SyncResult, force: boolean): Promise<void> {
  const dirty = await dirtyPaths(root, pathsToWrite(result));
  if (dirty.length > 0 && !force) {
    throw new UsageError(`uncommitted changes in ${dirty.join(", ")}; commit or stash them, or pass --force`);
  }
}

export async function initCommand(root: string, options: CommandOptions, io: Io): Promise<number> {
  if (options.relock) return relock(root, options, io);
  if (existsSync(join(root, CONFIG_FILE))) {
    throw new UsageError(`${CONFIG_FILE} already exists; run \`repokit update\` or \`repokit check\``);
  }
  const stacks = options.stacks.length > 0 ? options.stacks : await detectStacks(root);
  if (stacks.length === 0) throw new UsageError("no supported stack detected; pass --stack node");

  const repo = await repoInfo(root);
  const holder = (await gitUserName(root)) ?? repo.owner ?? "the project authors";
  const config = defaultConfig({
    stacks,
    standard: STANDARD_VERSION,
    copyright: `${new Date().getFullYear()} ${holder}`,
    contact: repo.owner ? `https://github.com/${repo.owner}` : "the repository maintainers",
    codeowners: repo.owner ? [`@${repo.owner}`] : [],
  });
  const ctx = await buildContext(root, config, repo);
  const adopt = options.adoptAll ? ("all" as const) : new Set(options.adopt);
  const result = await computeSync(root, planOutputs(ctx), null, { adopt, accept: new Set() });
  printResult(io, result);
  if (options.dryRun) {
    io.out("dry run: nothing written");
    return 0;
  }
  await guardUncommitted(root, result, options.force);
  await writeFile(join(root, CONFIG_FILE), renderConfig(config));
  await applySync(root, result, null, STANDARD_VERSION);
  io.out(`applied standard ${STANDARD_VERSION}; wrote ${CONFIG_FILE}`);
  io.out(`next: install dependencies (this installs the git hooks), then commit with "chore(repokit): apply standard ${STANDARD_VERSION}"`);
  return 0;
}

/** Records the current content of every planned output as repokit's own, rebuilding a lost or corrupt lock. */
async function relock(root: string, options: CommandOptions, io: Io): Promise<number> {
  const config = await loadConfig(root);
  const ctx = await buildContext(root, config);
  const lock: Lock = { lockVersion: 1, standard: config.standard, entries: [] };
  for (const output of planOutputs(ctx)) {
    const current = await readCurrent(root, targetOf(output));
    if (current === null) continue;
    lock.entries.push({ id: outputId(output), module: output.module, hash: hashText(current), target: targetOf(output) });
    io.out(`recorded   ${output.path}`);
  }
  if (options.dryRun) {
    io.out("dry run: nothing written");
    return 0;
  }
  await writeLock(root, lock);
  io.out(`rebuilt .repokit/lock.json with ${lock.entries.length} entries`);
  return 0;
}
```

`src/commands/check.ts`:
```ts
import type { Io } from "../cli.js";
import { loadConfig } from "../config/load.js";
import { UsageError } from "../errors.js";
import { outputId } from "../model.js";
import { planOutputs } from "../plan.js";
import { readLock } from "../sync/lock.js";
import { computeSync } from "../sync/sync.js";
import { STANDARD_VERSION, compareVersions } from "../version.js";
import { buildContext } from "./context.js";
import { type CommandOptions, hasDrift, printResult } from "./report.js";

export function assertSupportedStandard(standard: string): void {
  if (compareVersions(standard, STANDARD_VERSION) > 0) {
    throw new UsageError(`this repository uses standard ${standard}, newer than ${STANDARD_VERSION}; upgrade repokit`);
  }
}

export async function checkCommand(root: string, options: CommandOptions, io: Io): Promise<number> {
  const config = await loadConfig(root);
  assertSupportedStandard(config.standard);
  const lock = await readLock(root);
  if (!lock) {
    io.err("repokit: .repokit/lock.json is missing; run `repokit init --relock`");
    return 1;
  }
  const ctx = await buildContext(root, config);
  const result = await computeSync(root, planOutputs(ctx), lock, { adopt: new Set(), accept: new Set() });
  const behind = config.standard !== STANDARD_VERSION || lock.standard !== STANDARD_VERSION;
  const clean = !hasDrift(result) && !behind;
  if (options.json) {
    io.out(
      JSON.stringify({
        clean,
        standard: { config: config.standard, lock: lock.standard, current: STANDARD_VERSION },
        items: [
          ...result.decisions.filter((d) => d.action !== "unchanged").map((d) => ({ id: outputId(d.output), path: d.output.path, action: d.action })),
          ...result.removals.map((r) => ({ id: r.entry.id, path: r.entry.target.path, action: r.action })),
        ],
      }),
    );
    return clean ? 0 : 1;
  }
  printResult(io, result);
  if (behind) io.out(`standard   ${config.standard} applied, ${STANDARD_VERSION} available (run \`repokit update\`)`);
  io.out(clean ? "repository matches the standard" : "repository has drifted from the standard");
  return clean ? 0 : 1;
}
```

`src/commands/update.ts`:
```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Io } from "../cli.js";
import { CONFIG_FILE, loadConfig, setStandard } from "../config/load.js";
import { UsageError } from "../errors.js";
import { planOutputs } from "../plan.js";
import { applySync } from "../sync/apply.js";
import { readLock } from "../sync/lock.js";
import { computeSync } from "../sync/sync.js";
import { STANDARD_VERSION } from "../version.js";
import { assertSupportedStandard } from "./check.js";
import { buildContext } from "./context.js";
import { guardUncommitted } from "./init.js";
import { type CommandOptions, printResult } from "./report.js";

export async function updateCommand(root: string, options: CommandOptions, io: Io): Promise<number> {
  const config = await loadConfig(root);
  assertSupportedStandard(config.standard);
  const lock = await readLock(root);
  if (!lock) throw new UsageError(".repokit/lock.json is missing; run `repokit init --relock` first");
  const ctx = await buildContext(root, { ...config, standard: STANDARD_VERSION });
  const adopt = options.adoptAll ? ("all" as const) : new Set(options.adopt);
  const result = await computeSync(root, planOutputs(ctx), lock, { adopt, accept: new Set(options.accept) });
  printResult(io, result);
  if (options.dryRun) {
    io.out("dry run: nothing written");
    return 0;
  }
  await guardUncommitted(root, result, options.force);
  await applySync(root, result, lock, STANDARD_VERSION);
  if (config.standard !== STANDARD_VERSION) {
    const path = join(root, CONFIG_FILE);
    await writeFile(path, setStandard(await readFile(path, "utf8"), STANDARD_VERSION));
  }
  const conflicts = result.decisions.filter((d) => d.action === "conflict");
  if (conflicts.length > 0) {
    io.out(`${conflicts.length} file(s) kept because they were edited locally; new versions are beside them as *.repokit-new`);
    return 1;
  }
  io.out(`repository is on standard ${STANDARD_VERSION}; commit with "chore(repokit): update standard to ${STANDARD_VERSION}"`);
  return 0;
}
```

- [ ] **Step 4: Dispatch the commands from the CLI**

In `src/cli.ts`, add the imports:
```ts
import { checkCommand } from "./commands/check.js";
import { initCommand } from "./commands/init.js";
import type { CommandOptions } from "./commands/report.js";
import { updateCommand } from "./commands/update.js";
import { STACK_IDS, type StackId } from "./config/types.js";
```

Replace the line `throw new UsageError(\`unknown command: ${command}\`);` with:
```ts
    const stacks = values.stack as string[];
    for (const stack of stacks) {
      if (!(STACK_IDS as readonly string[]).includes(stack)) {
        throw new UsageError(`unknown stack ${stack}; expected one of ${STACK_IDS.join(", ")}`);
      }
    }
    const options: CommandOptions = {
      dryRun: values["dry-run"] as boolean,
      force: values.force as boolean,
      adopt: (values.adopt as string[]).map(toPosix),
      adoptAll: values["adopt-all"] as boolean,
      accept: (values.accept as string[]).map(toPosix),
      stacks: stacks as StackId[],
      relock: values.relock as boolean,
      json: values.json as boolean,
    };
    if (command === "init") return await initCommand(io.cwd, options, io);
    if (command === "check") return await checkCommand(io.cwd, options, io);
    if (command === "update") return await updateCommand(io.cwd, options, io);
    throw new UsageError(`unknown command: ${command}`);
```

And add below `USAGE`:
```ts
const toPosix = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "");
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all test files PASS (the e2e file has 6 tests); typecheck clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/commands src/cli.ts test/e2e.test.ts
git commit -m "feat(cli): add init, check and update commands"
```

---

### Task 11: Dogfood repokit on its own repository, add CI and open the pull request

**Files:**
- Create: `README.md`, `.github/workflows/ci.yml`, plus everything `repokit init` generates for this repository (`.repokit.yml`, `.repokit/lock.json`, `.editorconfig`, `.gitattributes`, `commitlint.config.mjs`, `lefthook.yml`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/…`)
- Modify: `.gitignore`, `package.json`, `package-lock.json` (by `repokit init` and `npm install`)

**Interfaces:**
- Consumes: the built CLI (`dist/cli.js`).

- [ ] **Step 1: Apply repokit to itself**

```bash
npm run build
node dist/cli.js init --dry-run
node dist/cli.js init
npm install
node dist/cli.js check
```
Expected: the dry run lists `create` for every output and `unmanaged` for nothing; `init` exits 0; `npm install` prints lefthook's hook installation; `check` prints `repository matches the standard` and exits 0.

- [ ] **Step 2: Verify the hooks work**

```bash
git add -A
git commit -m "bad message" ; echo "exit=$?"
```
Expected: commitlint rejects the message (`subject may not be empty` / `type may not be empty`) and `exit=1`. Nothing is committed.

- [ ] **Step 3: Add the CI workflow and README**

`.github/workflows/ci.yml` (hand-written: the `ci` module arrives in the reusable-workflows plan):
```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: ["22", "24"]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: git config --global user.name ci && git config --global user.email ci@example.com
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: node dist/cli.js check
```

`README.md`:
````markdown
# repokit

Keep every repository on one maintained standard: Conventional Commits, git hooks, community health
files, editor and gitignore settings, and Dependabot — applied once and kept in sync as the
standard evolves.

> Status: early development. Node repositories are supported; reusable CI workflows, release
> automation, more stacks and GitHub settings are on the way. See the
> [design](docs/superpowers/specs/2026-09-25-repokit-design.md).

## Usage

```bash
npx @vannt-dev/repokit init     # detect the stack, write .repokit.yml, apply the standard
npx @vannt-dev/repokit check    # report drift; exits 1 when the repository has drifted
npx @vannt-dev/repokit update   # move to the latest standard without overwriting your edits
```

`init` never overwrites a file you already have: it reports it as unmanaged. Pass
`--adopt <path>` to let repokit manage it, or list it under `owned` in `.repokit.yml` to keep it
yours. Every write command accepts `--dry-run`.

Requires Node.js 22.12 or newer.

## License

MIT
````

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck && npm run build && node dist/cli.js check
git add -A
git commit -m "chore(repokit): apply standard 1.0.0 to repokit itself"
```
Expected: all green; the commit passes the `commit-msg` and `pre-commit` hooks.

- [ ] **Step 5: Push and open the pull request**

```bash
git push -u origin feat/core
gh pr create --base main --head feat/core --title "feat: repokit core (init, check, update for Node repositories)" --body-file - <<'EOF'
Implements plan 1 of the repokit design: configuration, planner, sync engine with lock file, the
editorconfig, gitignore, commits, hooks, health and deps modules, the node stack pack and the
init/check/update commands. repokit applies its own standard to this repository.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr checks --watch
```
Expected: all four CI matrix jobs pass. Merging waits for the owner's review.
