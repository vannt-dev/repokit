# repokeeper stack packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let repokeeper manage Python, Dart/Flutter, shell/PowerShell, Java (Maven, Gradle) and .NET repositories, and make the node pack NestJS-aware, each with a reusable CI workflow tested against a fixture.

**Architecture:** Every pack is pure data plus one `resolve()` that reads the repository: staged commands for lefthook, the pre-push test command, gitignore templates, Dependabot ecosystems, release facts and a `CiJob`. Non-node packs share one CI shape: their reusable workflow sets up the toolchain, runs an `install-command`, then runs a JSON list of `commands` in order. Hooks and CONTRIBUTING learn to work without Node dependencies in the repository (`npx --yes` pinned to the standard's versions, verified while planning).

**Tech Stack:** Existing stack. New actions, pinned by SHA: `actions/setup-python` v7.0.0 `5fda3b95a4ea91299a34e894583c3862153e4b97`, `astral-sh/setup-uv` v10.2.0 `c18668ad3cf93ea998bef934396af7bb5c839dc7`, `dart-lang/setup-dart` v1.8.1 `6afc89df92d6eb3834022f73cd65adc8cdfcb92d`, `subosito/flutter-action` v2.23.0 `1a449444c387b1966244ae4d4f8c696479add0b2`, `actions/setup-java` v6.0.1 `de7274f081f381c8f8158605e0321c36c376e2e6`, `gradle/actions/setup-gradle` v6.3.0 `9c971963bec38e04b3d30dcc455b5382be2fdbfb`, `actions/setup-dotnet` v6.0.0 `a98b56852c35b8e3190ac28c8c2271da59106c68`. Tools: shfmt v3.14.1, PSScriptAnalyzer 1.25.0.

**Spec:** `docs/superpowers/specs/2026-09-25-repokeeper-design.md` — delivery step 4 (sections 4 and 5, the stack-pack rows of section 6 and 10). Pilots on real repositories need the first npm release (plan 2 Task 8) and are listed at the end, owner-gated.

## Global Constraints

- Standard version becomes `1.2.0` (the `.editorconfig` gains a 4-space section; NestJS repositories get `test:e2e` in CI).
- Default CI matrices come from spec section 5: Python 3.11–3.13, Flutter/Dart `stable`, script on ubuntu-latest and windows-latest, Temurin 17 and 21, .NET 8.0 and 9.0; each pack also accepts `stack_options.<id>.versions` and `os`.
- Non-node repositories get their tools through `npx --yes` pinned to `TOOL_VERSIONS` (commitlint 21.2.3, lefthook 2.1.14); Node.js 22+ on developer machines is required for the hooks, as the spec says.
- Every third-party action inside the reusable workflows is pinned by commit SHA with a version comment, and every job declares `permissions`.
- A reusable stack workflow always has `working-directory`, `os` and a `*-versions` input where the stack has versions; the workflow-tests contract compares every other input with what the pack resolves for the fixture.
- Exit codes, POSIX paths, the never-overwrite rule and Conventional Commits without trailers still hold. Work happens on branch `feat/stacks`; `main` only receives it through a pull request.

## Review Focus

- `.editorconfig` says `indent_size = 2` for every file, and `dotnet format` enforces `.editorconfig`: a .NET repository would be told to re-indent all C# to 2 spaces. → C#/F#/VB and Python get `indent_size = 4`; test in Task 1.
- A repository with a `deploy.sh` beside `package.json` must be detected as node only, not node + script. → test in Task 4.
- A non-node repository has no `node_modules`: the `commit-msg` hook must still find commitlint and its config preset. → pinned `npx --yes --package …` form; test in Task 1 (the form itself was run while planning: it rejects `bad message` and accepts `feat: ok thing`).
- Several `.sln`/`.csproj` files at the root make `dotnet restore` fail with MSB1011. → the pack names the first solution; test in Task 6.
- A `pom.xml` whose first `<version>` belongs to `<parent>` or a dependency, or uses `${revision}`: the release version must be the project's own, or null. → test in Task 5.

---

## File structure

```
src/
  stacks/support.ts       checkKeys, stringList, optionalString, filesMatching, readText (new; node pack moves to it)
  stacks/types.ts         detect(root): boolean
  stacks/index.ts         registry of all packs, script as a fallback stack
  stacks/python.ts · dart.ts · script.ts · java.ts · dotnet.ts   (new)
  stacks/node.ts          detect(); NestJS test:e2e
  model.ts                ReleaseExtraFile; ReleaseInfo.extraFiles
  modules/hooks.ts        commit-msg through pinned npx without a node stack
  modules/health.ts       CONTRIBUTING: lefthook install through npx without a node stack
  modules/editorconfig.ts 4-space section for C#/F#/VB and Python
  platforms/github.ts     release-please extra-files
  version.ts              STANDARD_VERSION 1.2.0
templates/gitignore/      Python · Dart · Java · Maven · Gradle · VisualStudio (vendored from github/gitignore)
.github/workflows/        stack-python.yml · stack-dart.yml · stack-script.yml · stack-java.yml · stack-dotnet.yml (new); workflow-tests.yml (jobs added)
fixtures/                 python · dart · script · java-maven · java-gradle · dotnet (new)
test/
  modules-non-node.test.ts · stacks-python.test.ts · stacks-dart.test.ts · stacks-script.test.ts · stacks-java.test.ts · stacks-dotnet.test.ts (new)
  workflows.test.ts (table-driven) · stacks.test.ts · stacks-node-ci.test.ts · modules-core.test.ts · e2e.test.ts (modified)
```

---

### Task 1: Shared plumbing for non-node packs

**Files:**
- Create: `src/stacks/support.ts`, `test/modules-non-node.test.ts`
- Modify: `src/stacks/types.ts`, `src/stacks/node.ts`, `src/stacks/index.ts`, `src/model.ts`, `src/modules/hooks.ts`, `src/modules/health.ts`, `src/modules/editorconfig.ts`, `src/platforms/github.ts`, `test/workflows.test.ts`, `test/stacks.test.ts`, `test/modules-core.test.ts`

**Interfaces:**
- Consumes: `ConfigError`, `CONFIG_FILE`, `TOOL_VERSIONS`, `StackOptions`, `makeContext`, `nodeResolved`.
- Produces:
  - `checkKeys(stack: StackId, options: StackOptions, keys: readonly string[]): void`; `stringList(stack, options, key): string[] | undefined`; `optionalString(stack, options, key): string | undefined`; `filesMatching(root, dir, pattern: RegExp): string[]`; `readText(root, file): Promise<string | null>`
  - `StackPack.detect: (root: string) => boolean`
  - `type ReleaseExtraFile = string | { type: "xml"; path: string; xpath: string }`; `ReleaseInfo.extraFiles?: ReleaseExtraFile[]`
  - `test/workflows.test.ts` tables `REUSABLE: string[]` and `FIXTURES: { job: string; dir: string; pack: StackPack }[]` that later tasks append to

- [ ] **Step 1: Create the branch**

```bash
cd F:/ai-agent/repokeeper
git switch main && git pull --ff-only && git switch -c feat/stacks
```

- [ ] **Step 2: Write the failing tests**

`test/modules-non-node.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { FileOutput } from "../src/model.js";
import { editorconfigModule } from "../src/modules/editorconfig.js";
import { healthModule } from "../src/modules/health.js";
import { hooksModule } from "../src/modules/hooks.js";
import { releaseModule } from "../src/modules/release.js";
import { TOOL_VERSIONS } from "../src/version.js";
import { makeContext, nodeResolved } from "./helpers.js";

const python = nodeResolved({
  id: "python",
  staged: [],
  test: "python -m pytest",
  install: "python -m pip install -e .",
  gitignore: ["Python"],
  dependabot: ["pip"],
  release: { type: "python", version: "0.1.0" },
});
const file = (outputs: ReturnType<typeof hooksModule.outputs>, path: string) =>
  outputs.find((o) => o.path === path) as FileOutput;

describe("repositories without a node stack", () => {
  it("run commitlint through npx pinned to the standard's versions", () => {
    const outputs = hooksModule.outputs(makeContext({ stacks: [python] }));
    expect(file(outputs, "lefthook.yml").content).toContain(
      `npx --yes --package @commitlint/cli@${TOOL_VERSIONS.commitlintCli} --package @commitlint/config-conventional@${TOOL_VERSIONS.commitlintConventional} -- commitlint --edit {1}`,
    );
    expect(outputs.some((o) => o.path === "package.json")).toBe(false);
  });

  it("tell contributors to install the hooks with a pinned lefthook", () => {
    const contributing = file(healthModule.outputs(makeContext({ stacks: [python] })), "CONTRIBUTING.md");
    expect(contributing.content).toContain("Run `python -m pip install -e .`.");
    expect(contributing.content).toContain(`\`npx --yes lefthook@${TOOL_VERSIONS.lefthook} install\``);
  });

  it("keep the node setup sentence for node repositories", () => {
    const contributing = file(healthModule.outputs(makeContext()), "CONTRIBUTING.md");
    expect(contributing.content).toContain("Installing the dependencies also installs the git hooks (lefthook).");
  });
});

describe("release extra files", () => {
  const xml = { type: "xml" as const, path: "Directory.Build.props", xpath: "//Project/PropertyGroup/Version" };
  const config = (extraFiles?: (typeof xml)[]) => {
    const release = { type: "simple" as const, version: "1.0.0", ...(extraFiles ? { extraFiles } : {}) };
    const outputs = releaseModule.outputs(makeContext({ stacks: [nodeResolved({ release })] }));
    return JSON.parse(file(outputs, "release-please-config.json").content).packages["."];
  };

  it("are passed to release-please", () => {
    expect(config([xml])["extra-files"]).toEqual([xml]);
  });

  it("are left out when a stack has none", () => {
    expect(config()).not.toHaveProperty("extra-files");
  });
});

describe("editorconfig", () => {
  it("keeps the 4-space convention of C#, F#, VB and Python", () => {
    const content = (editorconfigModule.outputs(makeContext())[0] as FileOutput).content;
    expect(content).toContain("[*.{cs,csx,vb,fs,fsx,fsi,py}]\nindent_size = 4\n");
  });
});
```

Replace `test/workflows.test.ts` with the table-driven version:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { nodeStack } from "../src/stacks/node.js";
import type { StackPack } from "../src/stacks/types.js";
import { TOOL_VERSIONS } from "../src/version.js";

interface Step {
  uses?: string;
  run?: string;
}
interface Job {
  permissions?: unknown;
  steps?: Step[];
  uses?: string;
  with?: Record<string, string>;
}
interface Workflow {
  on: { workflow_call?: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> } };
  jobs: Record<string, Job>;
}

/** Reusable workflows hosted here. Each stack task appends its workflow. */
const REUSABLE = ["stack-node.yml", "commitlint.yml", "release-please.yml"];

/** Fixture jobs in workflow-tests.yml and the pack that resolves each fixture. Each stack task appends its rows. */
const FIXTURES: { job: string; dir: string; pack: StackPack }[] = [
  { job: "node-npm", dir: "fixtures/node", pack: nodeStack },
  { job: "node-pnpm", dir: "fixtures/node-pnpm", pack: nodeStack },
];

const read = (name: string) => readFileSync(`.github/workflows/${name}`, "utf8");
const workflow = (name: string) => parse(read(name)) as Workflow;
const steps = (wf: Workflow) => Object.values(wf.jobs).flatMap((job) => job.steps ?? []);
/** Inputs a fixture job may set differently from the pack: where it runs, and on which versions. */
const comparable = (inputs: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries(inputs).filter(([key]) => key !== "working-directory" && key !== "os" && !key.endsWith("-versions")),
  );

describe.each(REUSABLE)("%s", (name) => {
  it("is a reusable workflow whose jobs all declare permissions", () => {
    const wf = workflow(name);
    expect(wf.on.workflow_call).toBeDefined();
    for (const job of Object.values(wf.jobs)) expect(job.permissions).toBeDefined();
  });

  it("pins every action by commit SHA", () => {
    const uses = steps(workflow(name)).flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40}$/);
  });

  it("keeps commands from reading the list they are looped over", () => {
    for (const step of steps(workflow(name))) {
      if (step.run?.includes("while IFS= read -r")) expect(step.run).toMatch(/<\/dev\/null\n/);
    }
  });
});

describe.each(FIXTURES)("fixture $dir", ({ job, dir, pack }) => {
  it("resolves to inputs its workflow accepts", async () => {
    const ci = (await pack.resolve(dir)).ci;
    expect(ci).not.toBeNull();
    const inputs = Object.keys(workflow(ci?.workflow ?? "").on.workflow_call?.inputs ?? {});
    expect(inputs).toEqual(expect.arrayContaining([...Object.keys(ci?.with ?? {}), "working-directory"]));
  });

  it("is exercised by workflow-tests with exactly what the pack resolves", async () => {
    const ci = (await pack.resolve(dir)).ci;
    const fixtureJob = workflow("workflow-tests.yml").jobs[job];
    expect(fixtureJob?.uses).toBe(`./.github/workflows/${ci?.workflow}`);
    expect(fixtureJob?.with?.["working-directory"]).toBe(dir);
    expect(comparable(fixtureJob?.with)).toEqual(comparable(ci?.with));
  });
});

it("stack-node also accepts a custom test command", () => {
  expect(Object.keys(workflow("stack-node.yml").on.workflow_call?.inputs ?? {})).toContain("test-command");
});

it("commitlint uses the standard's tool versions and header rule", () => {
  const text = read("commitlint.yml");
  expect(text).toContain(`@commitlint/cli@${TOOL_VERSIONS.commitlintCli}`);
  expect(text).toContain(`@commitlint/config-conventional@${TOOL_VERSIONS.commitlintConventional}`);
  expect(text).toContain(`"header-max-length": [2, "always", 100]`);
});

it("release-please exposes the outputs callers use", () => {
  expect(Object.keys(workflow("release-please.yml").on.workflow_call?.outputs ?? {})).toEqual(
    expect.arrayContaining(["release_created", "tag_name", "version", "major"]),
  );
});
```

In `test/stacks.test.ts`, change the last test to:
```ts
  it("explains that a pack is not available yet", () => {
    expect(() => getStackPack("dotnet")).toThrow(UsageError);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/modules-non-node.test.ts test/workflows.test.ts`
Expected: `modules-non-node` FAILS (the lefthook still says `npx --no-install`, CONTRIBUTING has no lefthook line, no `extra-files`, no 4-space section); `workflows.test.ts` PASSES (it only restructures existing checks).

- [ ] **Step 4: Write the implementation**

`src/stacks/support.ts`:
```ts
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FILE } from "../config/load.js";
import type { StackId } from "../config/types.js";
import { ConfigError } from "../errors.js";
import type { StackOptions } from "./types.js";

export function checkKeys(stack: StackId, options: StackOptions, keys: readonly string[]): void {
  for (const key of Object.keys(options)) {
    if (!keys.includes(key)) {
      throw new ConfigError(`${CONFIG_FILE}: stack_options.${stack}.${key} is not a known key (${keys.join(", ")})`);
    }
  }
}

/** A list option; YAML numbers such as `[22, 24]` count as strings. */
export function stringList(stack: StackId, options: StackOptions, key: string): string[] | undefined {
  const value = options[key];
  if (value === undefined) return undefined;
  const valid =
    Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" || typeof v === "number");
  if (!valid) throw new ConfigError(`${CONFIG_FILE}: stack_options.${stack}.${key} must be a non-empty list of strings`);
  return value.map(String);
}

export function optionalString(stack: StackId, options: StackOptions, key: string): string | undefined {
  const value = options[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`${CONFIG_FILE}: stack_options.${stack}.${key} must be a non-empty string`);
  }
  return value;
}

/** Names of the entries of `dir` (relative to root) matching `pattern`, sorted; empty when `dir` is missing. */
export function filesMatching(root: string, dir: string, pattern: RegExp): string[] {
  try {
    return readdirSync(join(root, dir))
      .filter((name) => pattern.test(name))
      .sort();
  } catch {
    return [];
  }
}

export async function readText(root: string, file: string): Promise<string | null> {
  try {
    return await readFile(join(root, file), "utf8");
  } catch {
    return null;
  }
}
```

`src/stacks/types.ts` — replace the `detect` member:
```ts
  /** Whether the repository at `root` uses this stack. */
  detect(root: string): boolean;
```

`src/stacks/node.ts`:
- delete the local `stringList` and `checkKeys` functions and the `CONFIG_FILE`/`ConfigError` imports (keep `UsageError`); import `checkKeys, stringList` from `./support.js`
- replace `detect: ["package.json"],` with `detect: (root) => existsSync(join(root, "package.json")),`
- change the calls to `checkKeys("node", options, OPTION_KEYS)` and `stringList("node", options, "<key>")`

`src/stacks/index.ts`:
```ts
import { STACK_IDS, type StackId } from "../config/types.js";
import { UsageError } from "../errors.js";
import { nodeStack } from "./node.js";
import type { StackPack } from "./types.js";

const PACKS: Partial<Record<StackId, StackPack>> = { node: nodeStack };

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
```

`src/model.ts` — add before `ReleaseInfo`, and a field to it:
```ts
/** A release-please `extra-files` entry: a path with release-please markers, or an XML element. */
export type ReleaseExtraFile = string | { type: "xml"; path: string; xpath: string };
```
```ts
  /** Files release-please updates besides the release type's own, such as Directory.Build.props. */
  extraFiles?: ReleaseExtraFile[];
```

`src/platforms/github.ts` — in `releaseAutomation`, replace the `".": { … }` package object with:
```ts
            ".": {
              "release-type": release.type,
              "changelog-path": "CHANGELOG.md",
              "bump-minor-pre-major": true,
              "include-component-in-tag": false,
              ...(release.extraFiles && release.extraFiles.length > 0 ? { "extra-files": release.extraFiles } : {}),
            },
```

`src/modules/hooks.ts` — replace the `commit-msg` block with:
```ts
    if (ctx.config.modules.commits) {
      const node = ctx.stacks.some((s) => s.id === "node");
      const commitlint = node
        ? "npx --no-install commitlint --edit {1}"
        : `npx --yes --package @commitlint/cli@${TOOL_VERSIONS.commitlintCli} --package @commitlint/config-conventional@${TOOL_VERSIONS.commitlintConventional} -- commitlint --edit {1}`;
      config["commit-msg"] = { jobs: [{ name: "commitlint", run: commitlint }] };
    }
```

`src/modules/health.ts` — import `TOOL_VERSIONS` from `../version.js` and replace the `setup` constant with:
```ts
    const install = ctx.stacks.map((s) => s.install).filter((c): c is string => c !== null);
    const run = install.length ? `Run ${install.map((c) => `\`${c}\``).join(" and ")}.` : "";
    const hooks = ctx.stacks.some((s) => s.id === "node")
      ? "Installing the dependencies also installs the git hooks (lefthook)."
      : `Then run \`npx --yes lefthook@${TOOL_VERSIONS.lefthook} install\` once to enable the git hooks (they need Node.js 22 or newer).`;
    const setup = [run, hooks].filter(Boolean).join(" ");
```

`src/modules/editorconfig.ts` — in `EDITORCONFIG`, add after the `[*]` section:
```
[*.{cs,csx,vb,fs,fsx,fsi,py}]
indent_size = 4

```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/modules-non-node.test.ts test/workflows.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS; typecheck and lint clean.

- [ ] **Step 6: Commit**

```bash
git add src test
git commit -m "feat(stacks): prepare hooks, release and detection for stacks without node"
```

---

### Task 2: Python pack

**Files:**
- Create: `src/stacks/python.ts`, `test/stacks-python.test.ts`, `templates/gitignore/Python.gitignore`, `.github/workflows/stack-python.yml`, `fixtures/python/pyproject.toml`, `fixtures/python/fixture.py`, `fixtures/python/tests/test_fixture.py`
- Modify: `src/stacks/index.ts`, `test/workflows.test.ts`, `.github/workflows/workflow-tests.yml`

**Interfaces:**
- Consumes: `support.ts` helpers (Task 1).
- Produces: `pythonStack: StackPack`; `stack-python.yml` inputs `python-versions`, `os`, `manager` (`pip`|`uv`), `install-command`, `commands`, `working-directory`.

- [ ] **Step 1: Write the failing test**

`test/stacks-python.test.ts`:
```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pythonStack } from "../src/stacks/python.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>, dirs: string[] = []): Promise<string> {
  const dir = await tempDir();
  for (const d of dirs) await mkdir(join(dir, d), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}
const PYPROJECT = '[project]\nname = "demo"\nversion = "0.4.0"\n\n[tool.ruff]\nline-length = 100\n';

it("is detected from pyproject.toml, requirements.txt or setup.cfg", async () => {
  expect(pythonStack.detect(await repo({ "pyproject.toml": PYPROJECT }))).toBe(true);
  expect(pythonStack.detect(await repo({ "requirements.txt": "" }))).toBe(true);
  expect(pythonStack.detect(await repo({ "setup.cfg": "" }))).toBe(true);
  expect(pythonStack.detect(await repo({ "main.py": "" }))).toBe(false);
});

it("installs with pip, checks with ruff and runs pytest when there are tests", async () => {
  const stack = await pythonStack.resolve(await repo({ "pyproject.toml": PYPROJECT, "requirements-dev.txt": "" }, ["tests"]));
  expect(stack.ci).toEqual({
    workflow: "stack-python.yml",
    with: {
      "python-versions": '["3.11","3.12","3.13"]',
      os: '["ubuntu-latest"]',
      manager: "pip",
      "install-command":
        "python -m pip install -r requirements-dev.txt && python -m pip install -e . && python -m pip install ruff pytest",
      commands: '["ruff format --check .","ruff check .","python -m pytest"]',
    },
  });
  expect(stack.staged.map((j) => j.run)).toEqual(["ruff format {staged_files}", "ruff check --fix {staged_files}"]);
  expect(stack.test).toBe("python -m pytest");
  expect(stack.install).toBe("python -m pip install -r requirements-dev.txt && python -m pip install -e .");
  expect(stack.release).toEqual({ type: "python", version: "0.4.0" });
  expect(stack.gitignore).toEqual(["Python"]);
  expect(stack.dependabot).toEqual(["pip"]);
});

it("adds mypy when it is configured and leaves pytest out without tests", async () => {
  const stack = await pythonStack.resolve(await repo({ "requirements.txt": "", "mypy.ini": "" }));
  expect(JSON.parse(stack.ci?.with.commands ?? "")).toEqual(["ruff format --check .", "ruff check .", "mypy ."]);
  expect(stack.ci?.with["install-command"]).toBe(
    "python -m pip install -r requirements.txt && python -m pip install ruff mypy",
  );
  expect(stack.test).toBeNull();
  expect(stack.release.version).toBeNull();
});

it("runs everything through uv when the project has uv.lock", async () => {
  const stack = await pythonStack.resolve(
    await repo({ "pyproject.toml": `${PYPROJECT}\n[tool.mypy]\nstrict = true\n`, "uv.lock": "" }, ["tests"]),
  );
  expect(stack.ci?.with).toMatchObject({
    manager: "uv",
    "install-command": "uv sync --frozen && uv pip install ruff mypy pytest",
    commands: '["uv run ruff format --check .","uv run ruff check .","uv run mypy .","uv run pytest"]',
  });
  expect(stack.staged.map((j) => j.run)).toEqual(["uvx ruff format {staged_files}", "uvx ruff check --fix {staged_files}"]);
  expect(stack.test).toBe("uv run pytest");
  expect(stack.install).toBe("uv sync");
  expect(stack.dependabot).toEqual(["uv"]);
});

it("takes versions, os and a test command from stack options", async () => {
  const stack = await pythonStack.resolve(await repo({ "requirements.txt": "" }), {
    versions: ["3.12"],
    os: ["windows-latest"],
    test: "python -m unittest",
  });
  expect(stack.ci?.with).toMatchObject({
    "python-versions": '["3.12"]',
    os: '["windows-latest"]',
    commands: '["ruff format --check .","ruff check .","python -m unittest"]',
  });
  expect(stack.test).toBe("python -m unittest");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stacks-python.test.ts`
Expected: FAIL — cannot resolve `../src/stacks/python.js`.

- [ ] **Step 3: Write the pack, template, workflow and fixture**

`src/stacks/python.ts`:
```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { StagedJob } from "../model.js";
import { checkKeys, filesMatching, optionalString, readText, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["versions", "os", "test"];

/** The `version = "…"` of the `[project]` table, if any. */
function projectVersion(pyproject: string): string | null {
  const table = pyproject.split(/^\[/m).find((section) => section.startsWith("project]"));
  return table ? (/^version\s*=\s*"([^"]+)"/m.exec(table)?.[1] ?? null) : null;
}

export const pythonStack: StackPack = {
  id: "python",
  detect: (root) => ["pyproject.toml", "requirements.txt", "setup.cfg"].some((f) => existsSync(join(root, f))),
  async resolve(root, options = {}) {
    checkKeys("python", options, OPTION_KEYS);
    const has = (path: string) => existsSync(join(root, path));
    const pyproject = (await readText(root, "pyproject.toml")) ?? "";
    const uv = has("uv.lock");
    const mypy = has("mypy.ini") || pyproject.includes("[tool.mypy]");
    const hasTests = has("tests") || has("test") || filesMatching(root, ".", /^test_.*\.py$/).length > 0;
    const customTest = optionalString("python", options, "test");
    const pytest = customTest === undefined && hasTests;
    const tools = ["ruff", ...(mypy ? ["mypy"] : []), ...(pytest ? ["pytest"] : [])];
    const run = uv ? "uv run " : "";

    const projectInstall: string[] = [];
    if (!uv) {
      if (has("requirements.txt")) projectInstall.push("python -m pip install -r requirements.txt");
      if (has("requirements-dev.txt")) projectInstall.push("python -m pip install -r requirements-dev.txt");
      if (/^\[project\]/m.test(pyproject)) projectInstall.push("python -m pip install -e .");
    }
    const ciInstall = uv
      ? `uv sync --frozen && uv pip install ${tools.join(" ")}`
      : [...projectInstall, `python -m pip install ${tools.join(" ")}`].join(" && ");
    const test = customTest ?? (pytest ? (uv ? "uv run pytest" : "python -m pytest") : null);
    const commands = [
      `${run}ruff format --check .`,
      `${run}ruff check .`,
      ...(mypy ? [`${run}mypy .`] : []),
      ...(test ? [test] : []),
    ];
    const ruff = uv ? "uvx ruff" : "ruff";
    const staged: StagedJob[] = [
      { name: "python:ruff-format", glob: "*.py", run: `${ruff} format {staged_files}` },
      { name: "python:ruff-check", glob: "*.py", run: `${ruff} check --fix {staged_files}` },
    ];
    return {
      id: "python",
      staged,
      test,
      install: uv ? "uv sync" : projectInstall.length > 0 ? projectInstall.join(" && ") : null,
      gitignore: ["Python"],
      dependabot: [uv ? "uv" : "pip"],
      ci: {
        workflow: "stack-python.yml",
        with: {
          "python-versions": JSON.stringify(stringList("python", options, "versions") ?? ["3.11", "3.12", "3.13"]),
          os: JSON.stringify(stringList("python", options, "os") ?? ["ubuntu-latest"]),
          manager: uv ? "uv" : "pip",
          "install-command": ciInstall,
          commands: JSON.stringify(commands),
        },
      },
      release: { type: "python", version: projectVersion(pyproject) },
    };
  },
};
```

In `src/stacks/index.ts`, import `pythonStack` and add `python: pythonStack` to `PACKS`.

Vendor the template:
```bash
curl -fsSL https://raw.githubusercontent.com/github/gitignore/main/Python.gitignore -o templates/gitignore/Python.gitignore
```

`.github/workflows/stack-python.yml`:
```yaml
name: stack-python

on:
  workflow_call:
    inputs:
      python-versions:
        description: JSON list of Python versions
        type: string
        default: '["3.11","3.12","3.13"]'
      os:
        description: JSON list of runner labels
        type: string
        default: '["ubuntu-latest"]'
      manager:
        description: pip or uv
        type: string
        default: pip
      install-command:
        description: Command that installs the project and its check tools
        type: string
        default: python -m pip install ruff
      commands:
        description: JSON list of shell commands run in order
        type: string
        default: '["ruff format --check .","ruff check ."]'
      working-directory:
        description: Directory holding the project
        type: string
        default: .

permissions:
  contents: read

jobs:
  python:
    name: python ${{ matrix.python }} (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(inputs.os) }}
        python: ${{ fromJSON(inputs.python-versions) }}
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
        working-directory: ${{ inputs.working-directory }}
    env:
      UV_PYTHON: ${{ matrix.python }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0
        with:
          python-version: ${{ matrix.python }}
      - if: inputs.manager == 'uv'
        uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
      - name: Install dependencies
        run: ${{ inputs.install-command }}
      - name: Run checks
        env:
          COMMANDS: ${{ inputs.commands }}
        run: |
          node -e 'for (const c of JSON.parse(process.env.COMMANDS)) console.log(c)' | while IFS= read -r command; do
            echo "::group::$command"
            bash -c "$command" </dev/null
            echo "::endgroup::"
          done
```

`fixtures/python/pyproject.toml`:
```toml
[build-system]
requires = ["setuptools>=69"]
build-backend = "setuptools.build_meta"

[project]
name = "fixture-python"
version = "0.0.0"
requires-python = ">=3.11"

[tool.setuptools]
py-modules = ["fixture"]
```

`fixtures/python/fixture.py`:
```python
def add(a: int, b: int) -> int:
    return a + b
```

`fixtures/python/tests/test_fixture.py`:
```python
from fixture import add


def test_add() -> None:
    assert add(1, 2) == 3
```

Append to `jobs:` in `.github/workflows/workflow-tests.yml`:
```yaml
  python:
    uses: ./.github/workflows/stack-python.yml
    with:
      working-directory: fixtures/python
      os: '["ubuntu-latest","windows-latest"]'
      python-versions: '["3.11","3.13"]'
      manager: pip
      install-command: python -m pip install -e . && python -m pip install ruff pytest
      commands: '["ruff format --check .","ruff check .","python -m pytest"]'
```

In `test/workflows.test.ts`, import `pythonStack` from `../src/stacks/python.js`, add `"stack-python.yml"` to `REUSABLE` and `{ job: "python", dir: "fixtures/python", pack: pythonStack }` to `FIXTURES`.

- [ ] **Step 4: Run the tests and the fixture locally**

Run: `npx vitest run test/stacks-python.test.ts test/workflows.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS.

Then check the fixture passes its own commands (uv supplies Python locally):
```bash
cd fixtures/python
uvx ruff@latest format --check . && uvx ruff@latest check .
uv run --isolated --with pytest --with-editable . python -m pytest -q
cd ../..
git status --short fixtures/python
```
Expected: ruff reports nothing to change; `1 passed`; `git status` lists only the three fixture files (delete any `.venv`, `__pycache__`, `*.egg-info` or `.pytest_cache` the run left behind).

- [ ] **Step 5: Commit**

```bash
git add src/stacks templates/gitignore/Python.gitignore .github/workflows fixtures/python test
git commit -m "feat(stacks): add the python pack with a ruff, mypy and pytest workflow"
```

---

### Task 3: Dart and Flutter pack

**Files:**
- Create: `src/stacks/dart.ts`, `test/stacks-dart.test.ts`, `templates/gitignore/Dart.gitignore`, `.github/workflows/stack-dart.yml`, `fixtures/dart/pubspec.yaml`, `fixtures/dart/lib/fixture_dart.dart`, `fixtures/dart/test/fixture_dart_test.dart`, `fixtures/dart/.gitignore`
- Modify: `src/stacks/index.ts`, `test/workflows.test.ts`, `.github/workflows/workflow-tests.yml`

**Interfaces:**
- Consumes: `support.ts` helpers.
- Produces: `dartStack: StackPack`; `stack-dart.yml` inputs `sdk-versions` (Dart SDK versions, or Flutter channels), `os`, `flutter` (`"true"`/`"false"`), `install-command`, `commands`, `working-directory`.

- [ ] **Step 1: Write the failing test**

`test/stacks-dart.test.ts`:
```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { dartStack } from "../src/stacks/dart.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>, dirs: string[] = []): Promise<string> {
  const dir = await tempDir();
  for (const d of dirs) await mkdir(join(dir, d), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

it("is detected from pubspec.yaml", async () => {
  expect(dartStack.detect(await repo({ "pubspec.yaml": "name: demo\n" }))).toBe(true);
  expect(dartStack.detect(await repo({ "main.dart": "" }))).toBe(false);
});

it("formats, analyzes and tests a Dart package with the dart tool", async () => {
  const stack = await dartStack.resolve(
    await repo({ "pubspec.yaml": "name: demo\nversion: 1.2.0\nenvironment:\n  sdk: ^3.5.0\n" }, ["test"]),
  );
  expect(stack.ci).toEqual({
    workflow: "stack-dart.yml",
    with: {
      "sdk-versions": '["stable"]',
      os: '["ubuntu-latest"]',
      flutter: "false",
      "install-command": "dart pub get",
      commands: '["dart format --output=none --set-exit-if-changed .","dart analyze","dart test"]',
    },
  });
  expect(stack.staged).toEqual([{ name: "dart:format", glob: "*.dart", run: "dart format {staged_files}" }]);
  expect(stack.test).toBe("dart test");
  expect(stack.install).toBe("dart pub get");
  expect(stack.release).toEqual({ type: "dart", version: "1.2.0" });
  expect(stack.gitignore).toEqual(["Dart"]);
  expect(stack.dependabot).toEqual(["pub"]);
});

it("uses flutter for a Flutter app and skips tests without a test directory", async () => {
  const stack = await dartStack.resolve(
    await repo({ "pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n" }),
  );
  expect(stack.ci?.with).toMatchObject({
    flutter: "true",
    "install-command": "flutter pub get",
    commands: '["dart format --output=none --set-exit-if-changed .","flutter analyze"]',
  });
  expect(stack.test).toBeNull();
  expect(stack.release.version).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stacks-dart.test.ts`
Expected: FAIL — cannot resolve `../src/stacks/dart.js`.

- [ ] **Step 3: Write the pack, template, workflow and fixture**

`src/stacks/dart.ts`:
```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkKeys, readText, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["versions", "os"];

export const dartStack: StackPack = {
  id: "dart",
  detect: (root) => existsSync(join(root, "pubspec.yaml")),
  async resolve(root, options = {}) {
    checkKeys("dart", options, OPTION_KEYS);
    const pubspec = (await readText(root, "pubspec.yaml")) ?? "";
    const flutter = /sdk:\s*flutter\b/.test(pubspec);
    const tool = flutter ? "flutter" : "dart";
    const test = existsSync(join(root, "test")) ? `${tool} test` : null;
    const commands = ["dart format --output=none --set-exit-if-changed .", `${tool} analyze`, ...(test ? [test] : [])];
    return {
      id: "dart",
      staged: [{ name: "dart:format", glob: "*.dart", run: "dart format {staged_files}" }],
      test,
      install: `${tool} pub get`,
      gitignore: ["Dart"],
      dependabot: ["pub"],
      ci: {
        workflow: "stack-dart.yml",
        with: {
          "sdk-versions": JSON.stringify(stringList("dart", options, "versions") ?? ["stable"]),
          os: JSON.stringify(stringList("dart", options, "os") ?? ["ubuntu-latest"]),
          flutter: String(flutter),
          "install-command": `${tool} pub get`,
          commands: JSON.stringify(commands),
        },
      },
      release: { type: "dart", version: /^version:\s*(\S+)/m.exec(pubspec)?.[1] ?? null },
    };
  },
};
```

In `src/stacks/index.ts`, import `dartStack` and add `dart: dartStack` to `PACKS`.

```bash
curl -fsSL https://raw.githubusercontent.com/github/gitignore/main/Dart.gitignore -o templates/gitignore/Dart.gitignore
```

`.github/workflows/stack-dart.yml`:
```yaml
name: stack-dart

on:
  workflow_call:
    inputs:
      sdk-versions:
        description: JSON list of Dart SDK versions, or Flutter channels when flutter is true
        type: string
        default: '["stable"]'
      os:
        description: JSON list of runner labels
        type: string
        default: '["ubuntu-latest"]'
      flutter:
        description: '"true" to set up Flutter instead of the Dart SDK'
        type: string
        default: "false"
      install-command:
        description: Command that fetches the packages
        type: string
        default: dart pub get
      commands:
        description: JSON list of shell commands run in order
        type: string
        default: '["dart format --output=none --set-exit-if-changed .","dart analyze"]'
      working-directory:
        description: Directory holding pubspec.yaml
        type: string
        default: .

permissions:
  contents: read

jobs:
  dart:
    name: ${{ inputs.flutter == 'true' && 'flutter' || 'dart' }} ${{ matrix.sdk }} (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(inputs.os) }}
        sdk: ${{ fromJSON(inputs.sdk-versions) }}
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
        working-directory: ${{ inputs.working-directory }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - if: inputs.flutter == 'true'
        uses: subosito/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2 # v2.23.0
        with:
          channel: ${{ matrix.sdk }}
          cache: true
      - if: inputs.flutter != 'true'
        uses: dart-lang/setup-dart@6afc89df92d6eb3834022f73cd65adc8cdfcb92d # v1.8.1
        with:
          sdk: ${{ matrix.sdk }}
      - name: Install dependencies
        run: ${{ inputs.install-command }}
      - name: Run checks
        env:
          COMMANDS: ${{ inputs.commands }}
        run: |
          node -e 'for (const c of JSON.parse(process.env.COMMANDS)) console.log(c)' | while IFS= read -r command; do
            echo "::group::$command"
            bash -c "$command" </dev/null
            echo "::endgroup::"
          done
```

`fixtures/dart/pubspec.yaml`:
```yaml
name: fixture_dart
description: Fixture for the stack-dart workflow.
version: 0.0.0
publish_to: none

environment:
  sdk: ^3.5.0

dev_dependencies:
  test: ^1.32.0
```

`fixtures/dart/lib/fixture_dart.dart`:
```dart
int add(int a, int b) => a + b;
```

`fixtures/dart/test/fixture_dart_test.dart`:
```dart
import 'package:fixture_dart/fixture_dart.dart';
import 'package:test/test.dart';

void main() {
  test('adds', () {
    expect(add(1, 2), 3);
  });
}
```

`fixtures/dart/.gitignore`:
```
.dart_tool/
pubspec.lock
```

Append to `jobs:` in `.github/workflows/workflow-tests.yml`:
```yaml
  dart:
    uses: ./.github/workflows/stack-dart.yml
    with:
      working-directory: fixtures/dart
      os: '["ubuntu-latest","windows-latest"]'
      sdk-versions: '["stable"]'
      flutter: "false"
      install-command: dart pub get
      commands: '["dart format --output=none --set-exit-if-changed .","dart analyze","dart test"]'
```

In `test/workflows.test.ts`, import `dartStack`, add `"stack-dart.yml"` to `REUSABLE` and `{ job: "dart", dir: "fixtures/dart", pack: dartStack }` to `FIXTURES`.

- [ ] **Step 4: Run the tests and the fixture locally**

Run: `npx vitest run test/stacks-dart.test.ts test/workflows.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS.

```bash
cd fixtures/dart && dart pub get && dart format --output=none --set-exit-if-changed . && dart analyze && dart test && cd ../..
git status --short fixtures/dart
```
Expected: `No issues found!`, `All tests passed!`; only the four fixture files are listed.

- [ ] **Step 5: Commit**

```bash
git add src/stacks templates/gitignore/Dart.gitignore .github/workflows fixtures/dart test
git commit -m "feat(stacks): add the dart and flutter pack"
```

---

### Task 4: Script pack

**Files:**
- Create: `src/stacks/script.ts`, `test/stacks-script.test.ts`, `.github/workflows/stack-script.yml`, `fixtures/script/scripts/hello.sh`, `fixtures/script/scripts/hello.ps1`
- Modify: `src/stacks/index.ts`, `test/stacks.test.ts`, `test/workflows.test.ts`, `.github/workflows/workflow-tests.yml`

**Interfaces:**
- Consumes: `support.ts` helpers; `detectStacks` fallback rule (Task 1).
- Produces: `scriptStack: StackPack`; `stack-script.yml` inputs `shell-scripts`, `powershell-scripts` (`"true"`/`"false"`), `test-command`, `working-directory`.

- [ ] **Step 1: Write the failing tests**

`test/stacks-script.test.ts`:
```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { scriptStack } from "../src/stacks/script.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>): Promise<string> {
  const dir = await tempDir();
  await mkdir(join(dir, "scripts"), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

it("is detected from shell or PowerShell scripts at the root or in scripts/", async () => {
  expect(scriptStack.detect(await repo({ "build.sh": "" }))).toBe(true);
  expect(scriptStack.detect(await repo({ "scripts/setup.ps1": "" }))).toBe(true);
  expect(scriptStack.detect(await repo({ "README.md": "" }))).toBe(false);
});

it("checks both kinds of script in CI and runs the declared test command", async () => {
  const stack = await scriptStack.resolve(await repo({ "install.sh": "", "scripts/setup.ps1": "" }), {
    test: "./test.sh",
  });
  expect(stack.ci).toEqual({
    workflow: "stack-script.yml",
    with: { "shell-scripts": "true", "powershell-scripts": "true", "test-command": "./test.sh" },
  });
  expect(stack.test).toBe("./test.sh");
  expect(stack.staged).toEqual([]);
  expect(stack.install).toBeNull();
  expect(stack.gitignore).toEqual([]);
  expect(stack.dependabot).toEqual([]);
  expect(stack.release).toEqual({ type: "simple", version: null });
});

it("leaves out checks for a kind of script the repository does not have", async () => {
  const stack = await scriptStack.resolve(await repo({ "run.sh": "" }));
  expect(stack.ci?.with).toEqual({ "shell-scripts": "true", "powershell-scripts": "false", "test-command": "" });
  expect(stack.test).toBeNull();
});
```

In `test/stacks.test.ts`, add inside `describe("registry", …)`:
```ts
  it("detects the script stack only when no other stack is present", async () => {
    expect(await detectStacks(await repoWith({ "deploy.sh": "" }))).toEqual(["script"]);
    expect(await detectStacks(await repoWith({ "deploy.sh": "", "package.json": "{}" }))).toEqual(["node"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/stacks-script.test.ts test/stacks.test.ts`
Expected: FAIL — cannot resolve `../src/stacks/script.js`; the registry test gets `[]` for `deploy.sh`.

- [ ] **Step 3: Write the pack, workflow and fixture**

`src/stacks/script.ts`:
```ts
import { checkKeys, filesMatching, optionalString } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["test"];

const scripts = (root: string, pattern: RegExp) =>
  filesMatching(root, ".", pattern).length + filesMatching(root, "scripts", pattern).length > 0;

export const scriptStack: StackPack = {
  id: "script",
  detect: (root) => scripts(root, /\.(sh|ps1)$/),
  async resolve(root, options = {}) {
    checkKeys("script", options, OPTION_KEYS);
    const test = optionalString("script", options, "test") ?? null;
    return {
      id: "script",
      // shfmt, ShellCheck and PSScriptAnalyzer are rarely installed locally; CI enforces them
      staged: [],
      test,
      install: null,
      gitignore: [],
      dependabot: [],
      ci: {
        workflow: "stack-script.yml",
        with: {
          "shell-scripts": String(scripts(root, /\.sh$/)),
          "powershell-scripts": String(scripts(root, /\.ps1$/)),
          "test-command": test ?? "",
        },
      },
      release: { type: "simple", version: null },
    };
  },
};
```

In `src/stacks/index.ts`, import `scriptStack` and add `script: scriptStack` to `PACKS`.

`.github/workflows/stack-script.yml`:
```yaml
name: stack-script

on:
  workflow_call:
    inputs:
      shell-scripts:
        description: '"true" to run ShellCheck and shfmt on *.sh'
        type: string
        default: "true"
      powershell-scripts:
        description: '"true" to run PSScriptAnalyzer on *.ps1'
        type: string
        default: "false"
      test-command:
        description: Test command run on Linux and Windows; empty for none
        type: string
        default: ""
      working-directory:
        description: Directory the checks start from
        type: string
        default: .

permissions:
  contents: read

jobs:
  shell:
    if: inputs.shell-scripts == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - name: ShellCheck
        run: git ls-files -z '*.sh' | xargs -0 --no-run-if-empty shellcheck
      - name: shfmt
        run: |
          curl -fsSL -o "$RUNNER_TEMP/shfmt" https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_linux_amd64
          chmod +x "$RUNNER_TEMP/shfmt"
          git ls-files -z '*.sh' | xargs -0 --no-run-if-empty "$RUNNER_TEMP/shfmt" -d
  powershell:
    if: inputs.powershell-scripts == 'true'
    runs-on: windows-latest
    permissions:
      contents: read
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - name: PSScriptAnalyzer
        shell: pwsh
        run: |
          Install-Module PSScriptAnalyzer -RequiredVersion 1.25.0 -Force -Scope CurrentUser
          $issues = Invoke-ScriptAnalyzer -Path . -Recurse
          $issues | Format-Table -AutoSize
          if ($issues) { exit 1 }
  test:
    if: inputs.test-command != ''
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
        working-directory: ${{ inputs.working-directory }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - run: ${{ inputs.test-command }}
```

`fixtures/script/scripts/hello.sh`:
```sh
#!/usr/bin/env bash
set -euo pipefail

name="${1:-world}"
echo "hello, ${name}"
```

`fixtures/script/scripts/hello.ps1`:
```powershell
param(
    [string]$Name = 'world'
)

Write-Output "hello, $Name"
```

Append to `jobs:` in `.github/workflows/workflow-tests.yml`:
```yaml
  script:
    uses: ./.github/workflows/stack-script.yml
    with:
      working-directory: fixtures/script
      shell-scripts: "true"
      powershell-scripts: "true"
      test-command: ""
```

In `test/workflows.test.ts`, import `scriptStack`, add `"stack-script.yml"` to `REUSABLE` and `{ job: "script", dir: "fixtures/script", pack: scriptStack }` to `FIXTURES`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/stacks-script.test.ts test/stacks.test.ts test/workflows.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS. (ShellCheck, shfmt and PSScriptAnalyzer run on the fixture in CI.)

- [ ] **Step 5: Commit**

```bash
git add src/stacks .github/workflows fixtures/script test
git commit -m "feat(stacks): add the script pack for shell and PowerShell repositories"
```

---

### Task 5: Java pack (Maven and Gradle)

**Files:**
- Create: `src/stacks/java.ts`, `test/stacks-java.test.ts`, `templates/gitignore/Java.gitignore`, `templates/gitignore/Maven.gitignore`, `templates/gitignore/Gradle.gitignore`, `.github/workflows/stack-java.yml`, `fixtures/java-maven/pom.xml`, `fixtures/java-maven/src/main/java/dev/vannt/fixture/Greeter.java`, `fixtures/java-maven/src/test/java/dev/vannt/fixture/GreeterTest.java`, `fixtures/java-gradle/settings.gradle.kts`, `fixtures/java-gradle/build.gradle.kts`, and the same two Java sources under `fixtures/java-gradle/src/`
- Modify: `src/stacks/index.ts`, `test/workflows.test.ts`, `.github/workflows/workflow-tests.yml`

**Interfaces:**
- Consumes: `support.ts` helpers; `ReleaseInfo.extraFiles` (Task 1).
- Produces: `javaStack: StackPack`; `stack-java.yml` inputs `java-versions`, `os`, `build-tool` (`maven`|`gradle`), `gradle-version` (empty for the wrapper), `commands`, `working-directory`.

- [ ] **Step 1: Write the failing test**

`test/stacks-java.test.ts`:
```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { javaStack } from "../src/stacks/java.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>): Promise<string> {
  const dir = await tempDir();
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}
const POM = [
  "<project>",
  "  <parent>",
  "    <groupId>org.springframework.boot</groupId>",
  "    <version>3.5.0</version>",
  "  </parent>",
  "  <artifactId>demo</artifactId>",
  "  <version>2.3.0</version>",
  "  <dependencies>",
  "    <dependency>",
  "      <version>1.0.0</version>",
  "    </dependency>",
  "  </dependencies>",
  "</project>",
].join("\n");

it("is detected from pom.xml or a Gradle build file", async () => {
  expect(javaStack.detect(await repo({ "pom.xml": POM }))).toBe(true);
  expect(javaStack.detect(await repo({ "build.gradle": "" }))).toBe(true);
  expect(javaStack.detect(await repo({ "build.gradle.kts": "" }))).toBe(true);
  expect(javaStack.detect(await repo({ "Main.java": "" }))).toBe(false);
});

it("verifies a Maven project through its wrapper and reads the project's own version", async () => {
  const stack = await javaStack.resolve(await repo({ "pom.xml": POM, mvnw: "" }));
  expect(stack.ci).toEqual({
    workflow: "stack-java.yml",
    with: {
      "java-versions": '["17","21"]',
      os: '["ubuntu-latest"]',
      "build-tool": "maven",
      "gradle-version": "",
      commands: '["./mvnw -B verify"]',
    },
  });
  expect(stack.test).toBe("./mvnw -B verify");
  expect(stack.staged).toEqual([]);
  expect(stack.install).toBeNull();
  expect(stack.gitignore).toEqual(["Java", "Maven"]);
  expect(stack.dependabot).toEqual(["maven"]);
  expect(stack.release).toEqual({ type: "maven", version: "2.3.0" });
});

it("treats a property placeholder as no version", async () => {
  const stack = await javaStack.resolve(await repo({ "pom.xml": "<project>\n  <version>${revision}</version>\n</project>\n" }));
  expect(stack.release).toEqual({ type: "maven", version: null });
  expect(stack.test).toBe("mvn -B verify");
});

it("checks a Gradle project, installing Gradle when there is no wrapper", async () => {
  const stack = await javaStack.resolve(await repo({ "build.gradle.kts": "", "gradle.properties": "version=1.4.0\n" }));
  expect(stack.ci?.with).toMatchObject({ "build-tool": "gradle", "gradle-version": "current", commands: '["gradle check"]' });
  expect(stack.gitignore).toEqual(["Java", "Gradle"]);
  expect(stack.dependabot).toEqual(["gradle"]);
  expect(stack.release).toEqual({ type: "simple", version: "1.4.0", extraFiles: ["gradle.properties"] });
});

it("uses the Gradle wrapper when present", async () => {
  const stack = await javaStack.resolve(await repo({ "build.gradle": "", gradlew: "" }));
  expect(stack.ci?.with).toMatchObject({ "gradle-version": "", commands: '["./gradlew check"]' });
  expect(stack.release).toEqual({ type: "simple", version: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stacks-java.test.ts`
Expected: FAIL — cannot resolve `../src/stacks/java.js`.

- [ ] **Step 3: Write the pack, templates, workflow and fixtures**

`src/stacks/java.ts`:
```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ReleaseInfo } from "../model.js";
import { checkKeys, readText, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["versions", "os"];

/** The project's own <version>: parent, dependency and plugin versions are removed first. */
function mavenVersion(pom: string): string | null {
  const own = pom.replace(/<(parent|dependencies|dependencyManagement|build|profiles|reporting)>[\s\S]*?<\/\1>/g, "");
  const version = /<version>\s*([^<\s]+)\s*<\/version>/.exec(own)?.[1];
  return version && !version.includes("${") ? version : null;
}

export const javaStack: StackPack = {
  id: "java",
  detect: (root) => ["pom.xml", "build.gradle", "build.gradle.kts"].some((f) => existsSync(join(root, f))),
  async resolve(root, options = {}) {
    checkKeys("java", options, OPTION_KEYS);
    const has = (path: string) => existsSync(join(root, path));
    const maven = has("pom.xml");
    let command: string;
    let release: ReleaseInfo;
    if (maven) {
      command = has("mvnw") ? "./mvnw -B verify" : "mvn -B verify";
      release = { type: "maven", version: mavenVersion((await readText(root, "pom.xml")) ?? "") };
    } else {
      command = has("gradlew") ? "./gradlew check" : "gradle check";
      const properties = await readText(root, "gradle.properties");
      const version = properties ? (/^version\s*=\s*(\S+)/m.exec(properties)?.[1] ?? null) : null;
      // release-please's generic updater changes gradle.properties once it carries x-release-please markers
      release = { type: "simple", version, ...(properties !== null ? { extraFiles: ["gradle.properties"] } : {}) };
    }
    return {
      id: "java",
      // formatting runs through the build (Spotless), not per staged file
      staged: [],
      test: command,
      install: null,
      gitignore: ["Java", maven ? "Maven" : "Gradle"],
      dependabot: [maven ? "maven" : "gradle"],
      ci: {
        workflow: "stack-java.yml",
        with: {
          "java-versions": JSON.stringify(stringList("java", options, "versions") ?? ["17", "21"]),
          os: JSON.stringify(stringList("java", options, "os") ?? ["ubuntu-latest"]),
          "build-tool": maven ? "maven" : "gradle",
          "gradle-version": !maven && !has("gradlew") ? "current" : "",
          commands: JSON.stringify([command]),
        },
      },
      release,
    };
  },
};
```

In `src/stacks/index.ts`, import `javaStack` and add `java: javaStack` to `PACKS`.

```bash
for t in Java Maven Gradle; do curl -fsSL "https://raw.githubusercontent.com/github/gitignore/main/$t.gitignore" -o "templates/gitignore/$t.gitignore"; done
```

`.github/workflows/stack-java.yml`:
```yaml
name: stack-java

on:
  workflow_call:
    inputs:
      java-versions:
        description: JSON list of Java versions (Temurin)
        type: string
        default: '["17","21"]'
      os:
        description: JSON list of runner labels
        type: string
        default: '["ubuntu-latest"]'
      build-tool:
        description: maven or gradle
        type: string
        default: maven
      gradle-version:
        description: Gradle version to install; empty to use the wrapper
        type: string
        default: ""
      commands:
        description: JSON list of shell commands run in order
        type: string
        default: '["mvn -B verify"]'
      working-directory:
        description: Directory holding the build file
        type: string
        default: .

permissions:
  contents: read

jobs:
  java:
    name: java ${{ matrix.java }} (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(inputs.os) }}
        java: ${{ fromJSON(inputs.java-versions) }}
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
        working-directory: ${{ inputs.working-directory }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6 # v6.0.1
        with:
          distribution: temurin
          java-version: ${{ matrix.java }}
          cache: ${{ inputs.build-tool == 'maven' && 'maven' || '' }}
      - if: inputs.build-tool == 'gradle'
        uses: gradle/actions/setup-gradle@9c971963bec38e04b3d30dcc455b5382be2fdbfb # v6.3.0
        with:
          gradle-version: ${{ inputs.gradle-version != '' && inputs.gradle-version || 'wrapper' }}
      - name: Run checks
        env:
          COMMANDS: ${{ inputs.commands }}
        run: |
          node -e 'for (const c of JSON.parse(process.env.COMMANDS)) console.log(c)' | while IFS= read -r command; do
            echo "::group::$command"
            bash -c "$command" </dev/null
            echo "::endgroup::"
          done
```

`fixtures/java-maven/pom.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>dev.vannt.fixture</groupId>
  <artifactId>fixture-java-maven</artifactId>
  <version>0.0.0</version>

  <properties>
    <maven.compiler.release>17</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.junit</groupId>
        <artifactId>junit-bom</artifactId>
        <version>6.1.3</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>

  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.6.0</version>
      </plugin>
    </plugins>
  </build>
</project>
```

`fixtures/java-maven/src/main/java/dev/vannt/fixture/Greeter.java` (and the same file at `fixtures/java-gradle/src/main/java/dev/vannt/fixture/Greeter.java`):
```java
package dev.vannt.fixture;

public final class Greeter {
  private Greeter() {}

  public static String greet(String name) {
    return "hello, " + name;
  }
}
```

`fixtures/java-maven/src/test/java/dev/vannt/fixture/GreeterTest.java` (and the same file under `fixtures/java-gradle/src/test/java/dev/vannt/fixture/`):
```java
package dev.vannt.fixture;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterTest {
  @Test
  void greets() {
    assertEquals("hello, world", Greeter.greet("world"));
  }
}
```

`fixtures/java-gradle/settings.gradle.kts`:
```kotlin
rootProject.name = "fixture-java-gradle"
```

`fixtures/java-gradle/build.gradle.kts`:
```kotlin
plugins {
    java
}

group = "dev.vannt.fixture"
version = "0.0.0"

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 17
}

tasks.test {
    useJUnitPlatform()
}
```

Append to `jobs:` in `.github/workflows/workflow-tests.yml`:
```yaml
  java-maven:
    uses: ./.github/workflows/stack-java.yml
    with:
      working-directory: fixtures/java-maven
      os: '["ubuntu-latest","windows-latest"]'
      java-versions: '["17","21"]'
      build-tool: maven
      gradle-version: ""
      commands: '["mvn -B verify"]'
  java-gradle:
    uses: ./.github/workflows/stack-java.yml
    with:
      working-directory: fixtures/java-gradle
      os: '["ubuntu-latest"]'
      java-versions: '["21"]'
      build-tool: gradle
      gradle-version: current
      commands: '["gradle check"]'
```

In `test/workflows.test.ts`, import `javaStack`, add `"stack-java.yml"` to `REUSABLE` and both `{ job: "java-maven", dir: "fixtures/java-maven", pack: javaStack }` and `{ job: "java-gradle", dir: "fixtures/java-gradle", pack: javaStack }` to `FIXTURES`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/stacks-java.test.ts test/workflows.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS. (Maven and Gradle are not installed locally; the fixtures build in CI.)

- [ ] **Step 5: Commit**

```bash
git add src/stacks templates/gitignore .github/workflows fixtures/java-maven fixtures/java-gradle test
git commit -m "feat(stacks): add the java pack for Maven and Gradle projects"
```

---

### Task 6: .NET pack

**Files:**
- Create: `src/stacks/dotnet.ts`, `test/stacks-dotnet.test.ts`, `templates/gitignore/VisualStudio.gitignore`, `.github/workflows/stack-dotnet.yml`, `fixtures/dotnet/Fixture.Tests.csproj`, `fixtures/dotnet/GreeterTests.cs`
- Modify: `src/stacks/index.ts`, `test/stacks.test.ts`, `test/workflows.test.ts`, `.github/workflows/workflow-tests.yml`

**Interfaces:**
- Consumes: `support.ts` helpers; `ReleaseExtraFile` (Task 1).
- Produces: `dotnetStack: StackPack`; `stack-dotnet.yml` inputs `dotnet-versions`, `os`, `commands`, `working-directory`. After this task every `StackId` has a pack, so `PACKS` becomes a full `Record<StackId, StackPack>`.

- [ ] **Step 1: Write the failing tests**

`test/stacks-dotnet.test.ts`:
```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { dotnetStack } from "../src/stacks/dotnet.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>): Promise<string> {
  const dir = await tempDir();
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}
const PROPS = "<Project>\n  <PropertyGroup>\n    <Version>1.5.0</Version>\n  </PropertyGroup>\n</Project>\n";

it("is detected from a solution or project file at the root", async () => {
  expect(dotnetStack.detect(await repo({ "App.sln": "" }))).toBe(true);
  expect(dotnetStack.detect(await repo({ "App.csproj": "" }))).toBe(true);
  expect(dotnetStack.detect(await repo({ "Program.cs": "" }))).toBe(false);
});

it("restores, checks formatting, builds and tests, and releases through Directory.Build.props", async () => {
  const stack = await dotnetStack.resolve(await repo({ "App.sln": "", "Directory.Build.props": PROPS }));
  expect(stack.ci).toEqual({
    workflow: "stack-dotnet.yml",
    with: {
      "dotnet-versions": '["8.0","9.0"]',
      os: '["ubuntu-latest"]',
      commands:
        '["dotnet restore","dotnet format --verify-no-changes --no-restore","dotnet build --no-restore","dotnet test --no-build"]',
    },
  });
  expect(stack.staged).toEqual([
    { name: "dotnet:format", glob: "*.{cs,vb,fs}", run: "dotnet format --include {staged_files}" },
  ]);
  expect(stack.test).toBe("dotnet test");
  expect(stack.install).toBe("dotnet restore");
  expect(stack.gitignore).toEqual(["VisualStudio"]);
  expect(stack.dependabot).toEqual(["nuget"]);
  expect(stack.release).toEqual({
    type: "simple",
    version: "1.5.0",
    extraFiles: [{ type: "xml", path: "Directory.Build.props", xpath: "//Project/PropertyGroup/Version" }],
  });
});

it("names the first solution when several project files sit at the root", async () => {
  const stack = await dotnetStack.resolve(await repo({ "B.sln": "", "A.sln": "", "Tool.csproj": "" }));
  expect(JSON.parse(stack.ci?.with.commands ?? "")[0]).toBe("dotnet restore A.sln");
  expect(stack.test).toBe("dotnet test A.sln");
  expect(stack.release).toEqual({ type: "simple", version: null });
});

it("reads the version of a single project file", async () => {
  const stack = await dotnetStack.resolve(await repo({ "Lib.csproj": PROPS.replace("<Project>", '<Project Sdk="Microsoft.NET.Sdk">') }));
  expect(stack.release).toEqual({
    type: "simple",
    version: "1.5.0",
    extraFiles: [{ type: "xml", path: "Lib.csproj", xpath: "//Project/PropertyGroup/Version" }],
  });
});
```

In `test/stacks.test.ts`, replace the "explains that a pack is not available yet" test with:
```ts
  it("has a pack for every stack id", () => {
    for (const id of STACK_IDS) expect(getStackPack(id).id).toBe(id);
  });
```
and add `import { STACK_IDS } from "../src/config/types.js";` (drop the `UsageError` import if nothing else uses it).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/stacks-dotnet.test.ts test/stacks.test.ts`
Expected: FAIL — cannot resolve `../src/stacks/dotnet.js`; `getStackPack("dotnet")` throws.

- [ ] **Step 3: Write the pack, template, workflow and fixture**

`src/stacks/dotnet.ts`:
```ts
import type { ReleaseInfo } from "../model.js";
import { checkKeys, filesMatching, readText, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["versions", "os"];
const SOLUTIONS = /\.(sln|slnx)$/;
const PROJECTS = /\.(csproj|fsproj|vbproj)$/;
const VERSION_XPATH = "//Project/PropertyGroup/Version";

const versionOf = (xml: string | null) => (xml ? (/<Version>\s*([^<\s]+)\s*<\/Version>/.exec(xml)?.[1] ?? null) : null);

export const dotnetStack: StackPack = {
  id: "dotnet",
  detect: (root) => filesMatching(root, ".", SOLUTIONS).length + filesMatching(root, ".", PROJECTS).length > 0,
  async resolve(root, options = {}) {
    checkKeys("dotnet", options, OPTION_KEYS);
    const solutions = filesMatching(root, ".", SOLUTIONS);
    const projects = filesMatching(root, ".", PROJECTS);
    // with several entries at the root, dotnet stops with MSB1011 unless one is named
    const target = solutions.length + projects.length > 1 ? ` ${solutions[0] ?? projects[0]}` : "";

    let release: ReleaseInfo = { type: "simple", version: null };
    for (const file of ["Directory.Build.props", ...(projects.length === 1 ? projects : [])]) {
      const version = versionOf(await readText(root, file));
      if (version) {
        release = { type: "simple", version, extraFiles: [{ type: "xml", path: file, xpath: VERSION_XPATH }] };
        break;
      }
    }
    return {
      id: "dotnet",
      staged: [{ name: "dotnet:format", glob: "*.{cs,vb,fs}", run: `dotnet format${target} --include {staged_files}` }],
      test: `dotnet test${target}`,
      install: `dotnet restore${target}`,
      gitignore: ["VisualStudio"],
      dependabot: ["nuget"],
      ci: {
        workflow: "stack-dotnet.yml",
        with: {
          "dotnet-versions": JSON.stringify(stringList("dotnet", options, "versions") ?? ["8.0", "9.0"]),
          os: JSON.stringify(stringList("dotnet", options, "os") ?? ["ubuntu-latest"]),
          commands: JSON.stringify([
            `dotnet restore${target}`,
            `dotnet format${target} --verify-no-changes --no-restore`,
            `dotnet build${target} --no-restore`,
            `dotnet test${target} --no-build`,
          ]),
        },
      },
      release,
    };
  },
};
```

`src/stacks/index.ts` — import `dotnetStack`, and with every pack present make the registry total:
```ts
const PACKS: Record<StackId, StackPack> = {
  node: nodeStack,
  python: pythonStack,
  dart: dartStack,
  script: scriptStack,
  java: javaStack,
  dotnet: dotnetStack,
};

export function getStackPack(id: StackId): StackPack {
  return PACKS[id];
}
```
and simplify `detectStacks` to `STACK_IDS.filter((id) => PACKS[id].detect(root))` (keep the script fallback line). Drop the now-unused `UsageError` import.

```bash
curl -fsSL https://raw.githubusercontent.com/github/gitignore/main/VisualStudio.gitignore -o templates/gitignore/VisualStudio.gitignore
```

`.github/workflows/stack-dotnet.yml`:
```yaml
name: stack-dotnet

on:
  workflow_call:
    inputs:
      dotnet-versions:
        description: JSON list of .NET SDK versions, all installed side by side
        type: string
        default: '["8.0","9.0"]'
      os:
        description: JSON list of runner labels
        type: string
        default: '["ubuntu-latest"]'
      commands:
        description: JSON list of shell commands run in order
        type: string
        default: '["dotnet restore","dotnet format --verify-no-changes --no-restore","dotnet build --no-restore","dotnet test --no-build"]'
      working-directory:
        description: Directory holding the solution or project
        type: string
        default: .

permissions:
  contents: read

jobs:
  dotnet:
    name: dotnet (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(inputs.os) }}
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
        working-directory: ${{ inputs.working-directory }}
    env:
      DOTNET_CLI_TELEMETRY_OPTOUT: "1"
      DOTNET_NOLOGO: "1"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - id: sdks
        name: List the SDK versions
        env:
          VERSIONS: ${{ inputs.dotnet-versions }}
        run: |
          {
            echo "list<<EOF"
            node -e 'for (const v of JSON.parse(process.env.VERSIONS)) console.log(v)'
            echo "EOF"
          } >> "$GITHUB_OUTPUT"
      - uses: actions/setup-dotnet@a98b56852c35b8e3190ac28c8c2271da59106c68 # v6.0.0
        with:
          dotnet-version: ${{ steps.sdks.outputs.list }}
      - name: Run checks
        env:
          COMMANDS: ${{ inputs.commands }}
        run: |
          node -e 'for (const c of JSON.parse(process.env.COMMANDS)) console.log(c)' | while IFS= read -r command; do
            echo "::group::$command"
            bash -c "$command" </dev/null
            echo "::endgroup::"
          done
```

`fixtures/dotnet/Fixture.Tests.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.10.1" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.5" />
  </ItemGroup>

</Project>
```

`fixtures/dotnet/GreeterTests.cs`:
```csharp
using Xunit;

namespace Fixture.Tests;

public class GreeterTests
{
    [Fact]
    public void Greets()
    {
        Assert.Equal("hello, world", $"hello, {"world"}");
    }
}
```

Append to `jobs:` in `.github/workflows/workflow-tests.yml`:
```yaml
  dotnet:
    uses: ./.github/workflows/stack-dotnet.yml
    with:
      working-directory: fixtures/dotnet
      os: '["ubuntu-latest","windows-latest"]'
      dotnet-versions: '["8.0","9.0"]'
      commands: '["dotnet restore","dotnet format --verify-no-changes --no-restore","dotnet build --no-restore","dotnet test --no-build"]'
```

In `test/workflows.test.ts`, import `dotnetStack`, add `"stack-dotnet.yml"` to `REUSABLE` and `{ job: "dotnet", dir: "fixtures/dotnet", pack: dotnetStack }` to `FIXTURES`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/stacks-dotnet.test.ts test/stacks.test.ts test/workflows.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS. (The .NET SDK is not usable locally; the fixture builds in CI, where `dotnet format` reads the repository's `.editorconfig` with the 4-space C# section from Task 1.)

- [ ] **Step 5: Commit**

```bash
git add src/stacks templates/gitignore/VisualStudio.gitignore .github/workflows fixtures/dotnet test
git commit -m "feat(stacks): add the dotnet pack"
```

---

### Task 7: NestJS awareness in the node pack

**Files:**
- Modify: `src/stacks/node.ts`, `test/stacks-node-ci.test.ts`

**Interfaces:**
- Consumes: node pack (plan 2).
- Produces: `scripts` input gains `test:e2e` after `test` when `nest-cli.json` exists and the script is defined.

- [ ] **Step 1: Write the failing test**

Append to `test/stacks-node-ci.test.ts`:
```ts
it("adds the NestJS end-to-end tests when nest-cli.json is present", async () => {
  const scripts = { lint: "eslint .", test: "jest", "test:e2e": "jest --config ./test/jest-e2e.json", build: "nest build" };
  const nest = await repo({ scripts }, { "nest-cli.json": "{}", "package-lock.json": "{}" });
  expect((await nodeStack.resolve(nest)).ci?.with.scripts).toBe('["lint","test","test:e2e","build"]');
  const plain = await repo({ scripts });
  expect((await nodeStack.resolve(plain)).ci?.with.scripts).toBe('["lint","test","build"]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stacks-node-ci.test.ts`
Expected: FAIL — `'["lint","test","build"]'` for the NestJS repository.

- [ ] **Step 3: Write the implementation**

In `src/stacks/node.ts`, add below `CI_SCRIPTS`:
```ts
/** NestJS projects scaffold end-to-end tests as a separate script. */
const NEST_CI_SCRIPTS = ["typecheck", "lint", "test", "test:e2e", "build"];
```
and change the `scripts` fallback to:
```ts
      (existsSync(join(root, "nest-cli.json")) ? NEST_CI_SCRIPTS : CI_SCRIPTS).filter((name) =>
        name === "test" ? hasTest : pkg.scripts?.[name] !== undefined,
      );
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/stacks-node-ci.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stacks/node.ts test/stacks-node-ci.test.ts
git commit -m "feat(stacks): run NestJS end-to-end tests in CI"
```

---

### Task 8: Standard 1.2.0, a non-node end-to-end run, docs and the pull request

**Files:**
- Modify: `src/version.ts`, `test/e2e.test.ts`, `docs/superpowers/specs/2026-09-25-repokeeper-design.md`, `README.md`, plus what `repokeeper update` writes in this repository (`.editorconfig`, `.repokeeper/lock.json`, `.repokeeper.yml`)

**Interfaces:**
- Consumes: every pack.

- [ ] **Step 1: Write the failing end-to-end test**

Add inside the `describe` block of `test/e2e.test.ts`:
```ts
  it("applies the standard to a python repository without node", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "pyproject.toml"), '[project]\nname = "demo"\nversion = "0.2.0"\n');
    sh(dir, "init", "-q", "-b", "main");
    sh(dir, "config", "user.name", "Demo User");
    sh(dir, "config", "user.email", "demo@example.com");
    sh(dir, "config", "core.autocrlf", "false");
    sh(dir, "add", "-A");
    sh(dir, "commit", "-qm", "chore: initial");

    expect((await repokeeper(dir, "init")).code).toBe(0);
    expect(parse(await readFile(join(dir, ".repokeeper.yml"), "utf8")).stacks).toEqual(["python"]);
    expect(existsSync(join(dir, "package.json"))).toBe(false);
    expect(await readFile(join(dir, "lefthook.yml"), "utf8")).toContain("npx --yes --package @commitlint/cli@");
    const ci = parse(await readFile(join(dir, ".github/workflows/ci.yml"), "utf8"));
    expect(ci.jobs.python.uses).toMatch(/stack-python\.yml@v\d+$/);
    expect(JSON.parse(await readFile(join(dir, ".release-please-manifest.json"), "utf8"))).toEqual({ ".": "0.2.0" });
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain("## Python (github/gitignore)");
    commitAll(dir);
    expect((await repokeeper(dir, "check")).code).toBe(0);
  });
```

Run: `npx vitest run test/e2e.test.ts`
Expected: PASS already if Tasks 1–6 are right (this is an integration check across them, not a new behavior); if it fails, the failure points at the task to fix.

- [ ] **Step 2: Move the standard to 1.2.0**

In `src/version.ts`: `export const STANDARD_VERSION = "1.2.0";`

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all PASS (tests read `STANDARD_VERSION`).

- [ ] **Step 3: Record the choices in the spec**

In `docs/superpowers/specs/2026-09-25-repokeeper-design.md`:
- section 5 pack table, `script` row, Format / lint column: `shfmt + ShellCheck, PSScriptAnalyzer (in CI; no local hook)` — drop markdownlint, which fails most existing READMEs on line length and is left to repositories that opt into it themselves;
- the release/gitignore table, `dart` row: `Dart` (github/gitignore has no Flutter template; Flutter projects keep the `.gitignore` that `flutter create` writes outside repokeeper's block);
- section 4, editorconfig row: add `C#, F#, VB and Python use 4-space indentation`.

- [ ] **Step 4: Apply standard 1.2.0 to repokeeper and update the README**

```bash
npm run build
node dist/cli.js update
node dist/cli.js check
```
Expected: `update` rewrites `.editorconfig` (4-space section) and moves `.repokeeper.yml` to `standard: 1.2.0`; `check` prints `repository matches the standard`.

In `README.md`, replace the status note with:
```markdown
> Status: early development. Supported stacks: Node.js (including NestJS), Python, Dart and
> Flutter, shell and PowerShell scripts, Java (Maven and Gradle) and .NET, each with CI and releases.
> GitHub settings are on the way. See the [design](docs/superpowers/specs/2026-09-25-repokeeper-design.md).
```

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build && node dist/cli.js check
git add -A
git commit -m "chore(repokeeper): update standard to 1.2.0 with python, dart, script, java and dotnet packs"
```

- [ ] **Step 6: Push and open the pull request** (only after the owner agrees to push)

```bash
git push -u origin feat/stacks
gh pr create --base main --head feat/stacks --title "feat: python, dart, script, java and dotnet stack packs" --body-file - <<'EOF'
Implements plan 3 of the design: stack packs for Python, Dart/Flutter, shell/PowerShell scripts,
Java (Maven, Gradle) and .NET, each with a reusable CI workflow tested against a fixture, plus NestJS
end-to-end tests in the node pack. Non-node repositories run commitlint and lefthook through npx pinned
to the standard's versions. Standard 1.2.0 adds a 4-space .editorconfig section for C#, F#, VB and Python.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr checks --watch
```
Expected: `ci` and every `workflow-tests` job (node-npm, node-pnpm, python, dart, script, java-maven, java-gradle, dotnet) pass.

---

## After this plan (owner-gated)

Once `repokeeper` 0.2.0 is on npm and `v0` exists (plan 2 Task 8), pilot the new packs as the spec's delivery step 4 asks: governed-agent-sdlc, nimbleclip (Flutter), ai-engineering-skills, and one Java and one .NET repository chosen by the owner — `npx repokeeper@latest init --dry-run`, then `init`, a branch, a pull request and green CI for each. Record anything done by hand as issues for the next plan.
