# repokeeper workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every repository repokeeper manages a CI workflow and release automation, built on reusable GitHub Actions workflows hosted in this repository, and move repokeeper itself onto them.

**Architecture:** Two new output kinds extend the sync engine: `yaml` (repokeeper owns named keys of a YAML file, like `json` does for `package.json`, so users may add their own jobs) and `seed` (a file created once and then left to other tools, for the release-please manifest). The node pack now reports what CI needs (versions, package manager, install command, scripts) and how it is released. The new `ci` and `release` modules turn those facts into caller workflows through the GitHub adapter; the callers `uses:` the reusable workflows `stack-node.yml`, `commitlint.yml` and `release.yml` in `vannt-dev/repokeeper`.

**Tech Stack:** Existing stack (Node.js ≥ 22.12, TypeScript 7, Vitest 5, `yaml` 2.9, Biome 2.5). GitHub Actions: `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, `googleapis/release-please-action` v5.0.0, all pinned by commit SHA.

**Spec:** `docs/superpowers/specs/2026-09-25-repokeeper-design.md` — this plan implements delivery step 3 (sections 4 `ci` and `release`, 6, 11). Plan 3 adds the python, dart, script, java and dotnet packs with their `stack-*.yml` workflows; plan 4 adds `repokeeper github apply`.

## Global Constraints

- Standard version becomes `1.1.0` (generated output changes). Package version stays `0.1.0` until release-please cuts a release.
- Reusable workflows live in `vannt-dev/repokeeper` under `.github/workflows/`. Callers reference `vannt-dev/repokeeper/.github/workflows/<file>@v<major>` where `<major>` is the major version of the installed repokeeper (`v0` during 0.x). Inside `vannt-dev/repokeeper` itself the callers use `./.github/workflows/<file>`.
- Every third-party action inside the reusable workflows is pinned by commit SHA with the version as a trailing comment: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`, `googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0`. Every job declares `permissions`.
- Commitlint in CI uses the standard's pinned versions (`@commitlint/cli` and `@commitlint/config-conventional` `21.2.3`) and the rule `"header-max-length": [2, "always", 100]`.
- Generated JSON files cannot carry comments; `release-please-config.json` starts with `$schema` instead of the managed header. YAML files repokeeper creates start with `# <MANAGED_HEADER> Keys and jobs you add yourself are left alone.`
- Exit codes, POSIX paths and the never-overwrite rule from plan 1 still hold.
- Commits follow Conventional Commits, header ≤ 100 characters, with no `Co-Authored-By` or other trailers. Work happens on branch `feat/workflows`; `main` only receives it through a pull request.

## Review Focus

- A user adds their own job or a comment to `ci.yml`: repokeeper's writes keep both, and `check` stays clean. → tests in Task 1 (comments) and Task 5 (added job, end to end).
- A `ci.yml` checked out with CRLF on Windows: key edits keep CRLF and `check` reads it unchanged. → test in Task 1.
- `stack_options.node.versions: [22, 24]` written without quotes parses as numbers: they are accepted as `"22"`, `"24"`. → test in Task 3.
- A package script that reads stdin must not swallow the names of the scripts after it in the CI loop. → `</dev/null` in `stack-node.yml`, pinned by a test in Task 4.
- `.release-please-manifest.json` already holds a later version after a few releases: repokeeper never rewrites it and never reports it. → test in Task 2.

---

## File structure

```
src/
  model.ts               + YamlOutput, SeedOutput, YAML_HEADER, CiJob, ReleaseInfo; ResolvedStack gains ci and release;
                           PlatformAdapter gains ciWorkflow and releaseAutomation
  version.ts             STANDARD_VERSION 1.1.0, REUSABLE_REPO, WORKFLOW_REF
  sync/yaml.ts           readYamlKey, setYamlKey, deleteYamlKey (new)
  sync/lock.ts · state.ts · apply.ts · decide.ts   yaml and seed targets
  stacks/types.ts        resolve(root, options?)
  stacks/node.ts         CI job facts, release facts, stack_options.node
  commands/context.ts    passes stack_options to the packs
  platforms/github.ts    ciWorkflow, releaseAutomation
  modules/ci.ts · release.ts (new) · index.ts
.github/workflows/
  stack-node.yml · commitlint.yml · release.yml     reusable (new)
  workflow-tests.yml                                 runs stack-node.yml against the fixtures (new, repo-only)
  ci.yml · release.yml (caller)                      managed by repokeeper from Task 7 on
fixtures/node/          npm fixture (package.json, package-lock.json, index.test.mjs)
fixtures/node-pnpm/     pnpm fixture (package.json, pnpm-lock.yaml, index.test.mjs)
test/
  helpers.ts             + syncOnce
  sync-yaml.test.ts · sync-seed.test.ts · stacks-node-ci.test.ts · workflows.test.ts · modules-ci-release.test.ts (new)
  plan.test.ts · e2e.test.ts (modified)
```

---

### Task 1: YAML key output kind

**Files:**
- Create: `src/sync/yaml.ts`, `test/sync-yaml.test.ts`
- Modify: `src/model.ts`, `src/sync/lock.ts`, `src/sync/state.ts`, `src/sync/apply.ts`, `test/helpers.ts`

**Interfaces:**
- Consumes: `getAtPath` (`src/sync/json.ts`), `UsageError`, `MANAGED_HEADER`, `computeSync`, `applySync`, `readLock`.
- Produces:
  - `interface YamlOutput { kind: "yaml"; path: string; keyPath: string[]; value: unknown; order?: readonly string[]; module: string }`, part of `Output`; `outputId` → `yaml:<path>#<JSON keyPath>`
  - `YAML_HEADER: string` (`src/model.ts`)
  - `Target` gains `{ kind: "yaml"; path: string; keyPath: string[] }`
  - `interface YamlWriteOptions { header: string; order?: readonly string[] }`; `readYamlKey(text, keyPath, file): string | null`; `setYamlKey(text: string | null, file, keyPath, value, options): string`; `deleteYamlKey(text, file, keyPath): string | null`
  - test helper `syncOnce(root, outputs, standard = "1.1.0"): Promise<SyncResult>`

- [ ] **Step 1: Create the branch and add the sync helper**

```bash
cd F:/ai-agent/repokeeper
git switch main && git pull --ff-only
git switch -c feat/workflows
```

In `test/helpers.ts`, add these imports next to the existing ones:
```ts
import type { Output } from "../src/model.js";
import { applySync } from "../src/sync/apply.js";
import { readLock } from "../src/sync/lock.js";
import { computeSync, type SyncResult } from "../src/sync/sync.js";
```
(`Output` joins the existing `import type { ModuleContext, RepoInfo, ResolvedStack } from "../src/model.js";` line.) Append:
```ts
/** Plans nothing: computes and applies one sync of `outputs`, as `update` would. */
export async function syncOnce(root: string, outputs: Output[], standard = "1.1.0"): Promise<SyncResult> {
  const lock = await readLock(root);
  const result = await computeSync(root, outputs, lock, { adopt: new Set(), accept: new Set() });
  await applySync(root, result, lock, standard);
  return result;
}
```

- [ ] **Step 2: Write the failing test**

`test/sync-yaml.test.ts`:
```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Output, YAML_HEADER } from "../src/model.js";
import { deleteYamlKey, readYamlKey, setYamlKey } from "../src/sync/yaml.js";
import { syncOnce, tempDir } from "./helpers.js";

const ORDER = ["name", "on", "jobs"];
const options = { header: "Managed.", order: ORDER };

describe("yaml keys", () => {
  it("creates a file with the header and keys in the given order", () => {
    let text = setYamlKey(null, "ci.yml", ["jobs", "node"], { uses: "x" }, options);
    text = setYamlKey(text, "ci.yml", ["name"], "ci", options);
    expect(text.startsWith("# Managed.\n")).toBe(true);
    expect(Object.keys(parse(text))).toEqual(["name", "jobs"]);
    expect(parse(text)).toEqual({ name: "ci", jobs: { node: { uses: "x" } } });
  });

  it("reads a key as JSON text, and null when it is absent", () => {
    const text = "name: ci\non:\n  pull_request: {}\n";
    expect(readYamlKey(text, ["on"], "ci.yml")).toBe('{"pull_request":{}}');
    expect(readYamlKey(text, ["jobs", "node"], "ci.yml")).toBeNull();
  });

  it("keeps comments, the user's keys and CRLF when replacing a key", () => {
    const text =
      "name: ci\r\n# my comment\r\njobs:\r\n  mine:\r\n    runs-on: ubuntu-latest\r\n  node:\r\n    uses: old\r\n";
    const next = setYamlKey(text, "ci.yml", ["jobs", "node"], { uses: "new" }, options);
    expect(next).toContain("# my comment\r\n");
    expect(next.replace(/\r\n/g, "")).not.toContain("\n");
    expect(parse(next)).toEqual({ name: "ci", jobs: { mine: { "runs-on": "ubuntu-latest" }, node: { uses: "new" } } });
  });

  it("does not fold long commands", () => {
    const run = `echo ${"x".repeat(200)}`;
    expect(setYamlKey(null, "a.yml", ["run"], run, options)).toContain(`run: ${run}\n`);
  });

  it("deletes a key and the parents it empties, then reports an empty document", () => {
    const once = deleteYamlKey("name: ci\njobs:\n  node:\n    uses: x\n", "ci.yml", ["jobs", "node"]);
    expect(parse(once as string)).toEqual({ name: "ci" });
    expect(deleteYamlKey(once as string, "ci.yml", ["name"])).toBeNull();
  });

  it("names the file when the YAML is invalid", () => {
    expect(() => readYamlKey("jobs: [a\n", ["jobs"], "ci.yml")).toThrow("ci.yml is not valid YAML");
  });
});

describe("yaml outputs through the sync engine", () => {
  const path = ".github/workflows/ci.yml";
  const job = (uses: string): Output => ({
    kind: "yaml",
    module: "ci",
    path,
    keyPath: ["jobs", "node"],
    value: { uses },
    order: ORDER,
  });
  const actions = async (root: string, outputs: Output[]) =>
    (await syncOnce(root, outputs)).decisions.map((d) => d.action);

  it("creates its key, leaves the user's jobs alone, reports edits and removes only its key", async () => {
    const root = await tempDir();
    const file = join(root, path);
    expect(await actions(root, [job("a")])).toEqual(["create"]);
    expect((await readFile(file, "utf8")).startsWith(`# ${YAML_HEADER}\n`)).toBe(true);

    await writeFile(file, `${await readFile(file, "utf8")}  mine:\n    runs-on: ubuntu-latest\n`);
    expect(await actions(root, [job("a")])).toEqual(["unchanged"]);
    expect(await actions(root, [job("b")])).toEqual(["write"]);

    await writeFile(file, (await readFile(file, "utf8")).replace("uses: b", "uses: edited"));
    expect(await actions(root, [job("c")])).toEqual(["conflict"]);
    expect(await readFile(file, "utf8")).toContain("uses: edited");

    await writeFile(file, (await readFile(file, "utf8")).replace("uses: edited", "uses: b"));
    const removed = await syncOnce(root, []);
    expect(removed.removals.map((r) => r.action)).toEqual(["delete"]);
    expect(parse(await readFile(file, "utf8"))).toEqual({ jobs: { mine: { "runs-on": "ubuntu-latest" } } });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/sync-yaml.test.ts`
Expected: FAIL — cannot resolve `../src/sync/yaml.js`.

- [ ] **Step 4: Write the implementation**

`src/sync/yaml.ts`:
```ts
import { Document, isMap, isScalar, parseDocument } from "yaml";
import { UsageError } from "../errors.js";
import { getAtPath } from "./json.js";

export interface YamlWriteOptions {
  /** Comment placed at the top of a file repokeeper creates. */
  header: string;
  /** Preferred order of top-level keys; keys not listed keep their relative order after them. */
  order?: readonly string[];
}

function parse(text: string, file: string): Document {
  const doc = parseDocument(text);
  const error = doc.errors[0];
  if (error) throw new UsageError(`${file} is not valid YAML: ${error.message.split("\n")[0]}`);
  return doc;
}

function render(doc: Document, original: string | null): string {
  const text = doc.toString({ lineWidth: 0 });
  return original?.includes("\r\n") ? text.replace(/\r?\n/g, "\r\n") : text;
}

/** JSON text of the value at `keyPath`, or null when the key is absent. */
export function readYamlKey(text: string, keyPath: string[], file: string): string | null {
  const value = getAtPath(parse(text, file).toJS() ?? {}, keyPath);
  return value === undefined ? null : JSON.stringify(value);
}

export function setYamlKey(
  text: string | null,
  file: string,
  keyPath: string[],
  value: unknown,
  options: YamlWriteOptions,
): string {
  const fresh = text === null || text.trim() === "";
  const doc = text !== null && !fresh ? parse(text, file) : new Document({});
  if (fresh) doc.commentBefore = ` ${options.header}`;
  doc.setIn(keyPath, doc.createNode(value));
  const order = options.order;
  if (order && isMap(doc.contents)) {
    const rank = (key: unknown) => {
      const index = order.indexOf(String(isScalar(key) ? key.value : key));
      return index === -1 ? order.length : index;
    };
    doc.contents.items.sort((a, b) => rank(a.key) - rank(b.key));
  }
  return render(doc, text);
}

/** Removes the key and any parents it leaves empty; null when nothing is left. */
export function deleteYamlKey(text: string, file: string, keyPath: string[]): string | null {
  const doc = parse(text, file);
  doc.deleteIn(keyPath);
  for (let depth = keyPath.length - 1; depth > 0; depth--) {
    const parent = doc.getIn(keyPath.slice(0, depth));
    if (!isMap(parent) || parent.items.length > 0) break;
    doc.deleteIn(keyPath.slice(0, depth));
  }
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return null;
  return render(doc, text);
}
```

In `src/model.ts`, add after `MANAGED_HEADER`:
```ts
/** Header of YAML files repokeeper creates but owns only in part. */
export const YAML_HEADER = `${MANAGED_HEADER} Keys and jobs you add yourself are left alone.`;
```
add after `JsonOutput`:
```ts
/** Named keys of a YAML file, such as one job of a workflow. */
export interface YamlOutput {
  kind: "yaml";
  path: string;
  keyPath: string[];
  value: unknown;
  /** Preferred order of top-level keys, applied whenever repokeeper writes the file. */
  order?: readonly string[];
  module: string;
}
```
change the union to `export type Output = FileOutput | BlockOutput | JsonOutput | YamlOutput;`, and in `outputId` add before the final `return`:
```ts
  if (output.kind === "yaml") return `yaml:${output.path}#${JSON.stringify(output.keyPath)}`;
```
(`describeOutput` already prints `path (key.path)` for every kind with a `keyPath`.)

In `src/sync/lock.ts`, extend `Target` with `| { kind: "yaml"; path: string; keyPath: string[] }` and add to `targetOf` before the final `return`:
```ts
  if (output.kind === "yaml") return { kind: "yaml", path: output.path, keyPath: output.keyPath };
```

In `src/sync/state.ts`, import `readYamlKey` from `./yaml.js` and add to `readCurrent` after the `block` line:
```ts
  if (target.kind === "yaml") return readYamlKey(text, target.keyPath, target.path);
```
(`desiredText` already returns `JSON.stringify(output.value)` for key outputs.)

In `src/sync/apply.ts`, import `YAML_HEADER` from `../model.js` and `deleteYamlKey, setYamlKey` from `./yaml.js`. In `write`, after the `block` line:
```ts
  if (output.kind === "yaml") {
    return put(path, setYamlKey(existing, output.path, output.keyPath, output.value, { header: YAML_HEADER, order: output.order }));
  }
```
In `remove`, after the `block` line:
```ts
  if (target.kind === "yaml") {
    const next = deleteYamlKey(existing, target.path, target.keyPath);
    return next === null ? rm(path, { force: true }) : put(path, next);
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/sync-yaml.test.ts && npm test && npm run typecheck && npm run lint`
Expected: 7 new tests PASS; the whole suite passes; typecheck and lint clean. If `Document` generics upset the type checker, type `parse` as returning `Document.Parsed` and keep `new Document({})` as `Document`.

- [ ] **Step 6: Commit**

```bash
git add src/model.ts src/sync test/helpers.ts test/sync-yaml.test.ts
git commit -m "feat(sync): manage named keys of YAML files so users can add their own jobs"
```

---

### Task 2: Seed output kind

**Files:**
- Create: `test/sync-seed.test.ts`
- Modify: `src/model.ts`, `src/sync/lock.ts`, `src/sync/state.ts`, `src/sync/apply.ts`, `src/sync/decide.ts`

**Interfaces:**
- Consumes: `syncOnce`, `tempDir` (Task 1).
- Produces: `interface SeedOutput { kind: "seed"; path: string; content: string; module: string }`, part of `Output`; `outputId` → `seed:<path>`; `Target` gains `{ kind: "seed"; path: string }`.

- [ ] **Step 1: Write the failing test**

`test/sync-seed.test.ts`:
```ts
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Output } from "../src/model.js";
import { readLock } from "../src/sync/lock.js";
import { syncOnce, tempDir } from "./helpers.js";

const path = ".release-please-manifest.json";
const manifest = (version: string): Output => ({
  kind: "seed",
  module: "release",
  path,
  content: `{ ".": "${version}" }\n`,
});
const actions = async (root: string, outputs: Output[]) =>
  (await syncOnce(root, outputs)).decisions.map((d) => d.action);

it("creates a seed once, then never rewrites or reports it", async () => {
  const root = await tempDir();
  expect(await actions(root, [manifest("0.1.0")])).toEqual(["create"]);
  await writeFile(join(root, path), '{ ".": "0.4.2" }\n');
  expect(await actions(root, [manifest("0.1.0")])).toEqual(["unchanged"]);
  expect(await readFile(join(root, path), "utf8")).toBe('{ ".": "0.4.2" }\n');
});

it("takes over an existing file without --adopt", async () => {
  const root = await tempDir();
  await writeFile(join(root, path), '{ ".": "2.0.0" }\n');
  expect(await actions(root, [manifest("0.1.0")])).toEqual(["unchanged"]);
  expect((await readLock(root))?.entries.map((e) => e.id)).toEqual([`seed:${path}`]);
});

it("recreates a deleted seed", async () => {
  const root = await tempDir();
  await actions(root, [manifest("0.1.0")]);
  await rm(join(root, path));
  expect(await actions(root, [manifest("0.1.0")])).toEqual(["create"]);
});

it("leaves the file in place when the module stops producing it", async () => {
  const root = await tempDir();
  await actions(root, [manifest("0.1.0")]);
  const result = await syncOnce(root, []);
  expect(result.removals.map((r) => r.action)).toEqual(["gone"]);
  expect(existsSync(join(root, path))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sync-seed.test.ts`
Expected: FAIL — the first test reports `unmanaged` or a type error for `kind: "seed"`.

- [ ] **Step 3: Write the implementation**

In `src/model.ts`, add after `FileOutput`:
```ts
/** A file repokeeper creates once and then leaves to other tools, such as a release manifest. */
export interface SeedOutput {
  kind: "seed";
  path: string;
  content: string;
  module: string;
}
```
change the union to `export type Output = FileOutput | SeedOutput | BlockOutput | JsonOutput | YamlOutput;`, add to `outputId` after the `file` line:
```ts
  if (output.kind === "seed") return `seed:${output.path}`;
```
and change the first line of `describeOutput` to:
```ts
  if (output.kind === "file" || output.kind === "seed") return output.path;
```

In `src/sync/lock.ts`, extend `Target` with `| { kind: "seed"; path: string }` and add to `targetOf` after the `file` line:
```ts
  if (output.kind === "seed") return { kind: "seed", path: output.path };
```

In `src/sync/state.ts`, add to `desiredText` after the `file` line, and to `readCurrent` after the `file` line:
```ts
  // desiredText: a seed only has to exist, so present content always compares equal
  if (output.kind === "seed") return "";
```
```ts
  // readCurrent
  if (target.kind === "seed") return "";
```

In `src/sync/apply.ts`, change the first line of `write` to
```ts
  if (output.kind === "file" || output.kind === "seed") return put(path, output.content);
```
and add at the top of `remove`, after `const path = ...`:
```ts
  if (target.kind === "seed") return;
```

In `src/sync/decide.ts`, add as the first line of `decideRemoval`:
```ts
  if (entry.target.kind === "seed") return "gone"; // other tools own a seed once it exists
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/sync-seed.test.ts && npm test && npm run typecheck && npm run lint`
Expected: 4 new tests PASS; suite, typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/model.ts src/sync test/sync-seed.test.ts
git commit -m "feat(sync): add seed outputs that are created once and then left to other tools"
```

---

### Task 3: CI and release facts from the node pack

**Files:**
- Create: `test/stacks-node-ci.test.ts`
- Modify: `src/model.ts`, `src/stacks/types.ts`, `src/stacks/node.ts`, `src/commands/context.ts`, `test/helpers.ts`

**Interfaces:**
- Consumes: `ConfigError`, `CONFIG_FILE`.
- Produces:
  - `interface CiJob { workflow: string; with: Record<string, string> }`
  - `type ReleaseType = "node" | "python" | "dart" | "maven" | "simple"`; `interface ReleaseInfo { type: ReleaseType; version: string | null }`
  - `ResolvedStack` gains `ci: CiJob | null` and `release: ReleaseInfo`
  - `type StackOptions = Record<string, unknown>`; `StackPack.resolve(root: string, options?: StackOptions)`
  - node pack `ci.with` keys: `node-versions`, `os`, `package-manager`, `install-command`, `cache`, `scripts` (JSON lists as strings)

- [ ] **Step 1: Write the failing test**

`test/stacks-node-ci.test.ts`:
```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ConfigError } from "../src/errors.js";
import { nodeStack } from "../src/stacks/node.js";
import { tempDir } from "./helpers.js";

async function repo(pkg: object, files: Record<string, string> = {}): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

it("passes the detected scripts, npm ci and the npm cache to the node workflow", async () => {
  const dir = await repo(
    { version: "1.4.0", scripts: { dev: "vite", build: "tsc", test: "vitest", lint: "biome check .", typecheck: "tsc --noEmit" } },
    { "package-lock.json": "{}" },
  );
  const resolved = await nodeStack.resolve(dir);
  expect(resolved.ci).toEqual({
    workflow: "stack-node.yml",
    with: {
      "node-versions": '["22","24"]',
      os: '["ubuntu-latest"]',
      "package-manager": "npm",
      "install-command": "npm ci",
      cache: "npm",
      scripts: '["typecheck","lint","test","build"]',
    },
  });
  expect(resolved.release).toEqual({ type: "node", version: "1.4.0" });
});

it("uses npm install without a cache when there is no lockfile, and skips the placeholder test", async () => {
  const { ci, release } = await nodeStack.resolve(
    await repo({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  );
  expect(ci?.with["install-command"]).toBe("npm install");
  expect(ci?.with.cache).toBe("");
  expect(ci?.with.scripts).toBe("[]");
  expect(release.version).toBeNull();
});

it("installs from a frozen lockfile with pnpm and yarn", async () => {
  expect((await nodeStack.resolve(await repo({}, { "pnpm-lock.yaml": "" }))).ci?.with).toMatchObject({
    "package-manager": "pnpm",
    "install-command": "pnpm install --frozen-lockfile",
    cache: "",
  });
  const yarnClassic = await nodeStack.resolve(await repo({}, { "yarn.lock": "" }));
  expect(yarnClassic.ci?.with["install-command"]).toBe("yarn install --frozen-lockfile");
  const yarnBerry = await nodeStack.resolve(await repo({}, { "yarn.lock": "", ".yarnrc.yml": "" }));
  expect(yarnBerry.ci?.with["install-command"]).toBe("yarn install --immutable");
});

it("applies stack options and accepts unquoted YAML numbers as versions", async () => {
  const { ci } = await nodeStack.resolve(await repo({ scripts: { test: "vitest" } }), {
    versions: [22, 24],
    os: ["ubuntu-latest", "windows-latest"],
    scripts: ["test", "standard"],
  });
  expect(ci?.with).toMatchObject({
    "node-versions": '["22","24"]',
    os: '["ubuntu-latest","windows-latest"]',
    scripts: '["test","standard"]',
  });
});

it("names the key of an invalid or unknown stack option", async () => {
  const dir = await repo({});
  await expect(nodeStack.resolve(dir, { versions: "22" })).rejects.toBeInstanceOf(ConfigError);
  await expect(nodeStack.resolve(dir, { versions: "22" })).rejects.toThrow(
    ".repokeeper.yml: stack_options.node.versions must be a non-empty list of strings",
  );
  await expect(nodeStack.resolve(dir, { verions: ["22"] })).rejects.toThrow(
    ".repokeeper.yml: stack_options.node.verions is not a known key (versions, os, scripts)",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stacks-node-ci.test.ts`
Expected: FAIL — `resolved.ci` is undefined.

- [ ] **Step 3: Write the implementation**

In `src/model.ts`, add before `ResolvedStack`:
```ts
/** One job of the caller CI workflow: a reusable workflow in the repokeeper repository and its inputs. */
export interface CiJob {
  workflow: string;
  with: Record<string, string>;
}

export type ReleaseType = "node" | "python" | "dart" | "maven" | "simple";

export interface ReleaseInfo {
  type: ReleaseType;
  /** Current version read from the project, or null when it has none. */
  version: string | null;
}
```
and add to `ResolvedStack`:
```ts
  /** CI job for this stack, or null when the stack has no reusable workflow. */
  ci: CiJob | null;
  release: ReleaseInfo;
```

`src/stacks/types.ts` becomes:
```ts
import type { StackId } from "../config/types.js";
import type { ResolvedStack } from "../model.js";

/** The stack's entry under `stack_options` in .repokeeper.yml. */
export type StackOptions = Record<string, unknown>;

export interface StackPack {
  id: StackId;
  /** Files whose presence at the repository root selects this pack. */
  detect: string[];
  /** Reads the repository to decide concrete commands. The only stack code that touches disk. */
  resolve(root: string, options?: StackOptions): Promise<ResolvedStack>;
}
```

In `src/stacks/node.ts`:
- add imports `import { CONFIG_FILE } from "../config/load.js";`, `import { ConfigError, UsageError } from "../errors.js";` (replacing the `UsageError`-only import) and `import type { StackOptions, StackPack } from "./types.js";`
- add `version?: string;` to `PackageJson`
- add above `nodeStack`:
```ts
const OPTION_KEYS = ["versions", "os", "scripts"];
const CI_SCRIPTS = ["typecheck", "lint", "test", "build"];

function stringList(options: StackOptions, key: string): string[] | undefined {
  const value = options[key];
  if (value === undefined) return undefined;
  const valid =
    Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" || typeof v === "number");
  if (!valid) throw new ConfigError(`${CONFIG_FILE}: stack_options.node.${key} must be a non-empty list of strings`);
  return value.map(String);
}

function checkKeys(options: StackOptions): void {
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.includes(key)) {
      throw new ConfigError(`${CONFIG_FILE}: stack_options.node.${key} is not a known key (${OPTION_KEYS.join(", ")})`);
    }
  }
}
```
- change `async resolve(root) {` to `async resolve(root, options = {}) {` and add `checkKeys(options);` as its first line
- replace the block from `const testScript = pkg.scripts?.test;` to the end of the returned object with:
```ts
    const testScript = pkg.scripts?.test;
    const hasTest = testScript !== undefined && testScript !== NPM_PLACEHOLDER_TEST;
    const npmLock = existsSync(join(root, "package-lock.json")) || existsSync(join(root, "npm-shrinkwrap.json"));
    const ciInstall =
      pm === "npm"
        ? npmLock
          ? "npm ci"
          : "npm install"
        : pm === "pnpm"
          ? "pnpm install --frozen-lockfile"
          : existsSync(join(root, ".yarnrc.yml"))
            ? "yarn install --immutable"
            : "yarn install --frozen-lockfile";
    const scripts =
      stringList(options, "scripts") ??
      CI_SCRIPTS.filter((name) => (name === "test" ? hasTest : pkg.scripts?.[name] !== undefined));
    return {
      id: "node",
      staged,
      test: hasTest ? `${pm} test` : null,
      install: `${pm} install`,
      gitignore: ["Node"],
      dependabot: ["npm"],
      ci: {
        workflow: "stack-node.yml",
        with: {
          "node-versions": JSON.stringify(stringList(options, "versions") ?? ["22", "24"]),
          os: JSON.stringify(stringList(options, "os") ?? ["ubuntu-latest"]),
          "package-manager": pm,
          "install-command": ciInstall,
          // setup-node can only cache npm here: pnpm and yarn come from corepack after it runs
          cache: pm === "npm" && npmLock ? "npm" : "",
          scripts: JSON.stringify(scripts),
        },
      },
      release: { type: "node", version: typeof pkg.version === "string" ? pkg.version : null },
    };
```

In `src/commands/context.ts`, pass the options:
```ts
  const stacks = await Promise.all(
    config.stacks.map((id) => getStackPack(id).resolve(root, config.stack_options[id] ?? {})),
  );
```

In `test/helpers.ts`, add to the object returned by `nodeResolved`, before `...overrides`:
```ts
    ci: {
      workflow: "stack-node.yml",
      with: {
        "node-versions": '["22","24"]',
        os: '["ubuntu-latest"]',
        "package-manager": "npm",
        "install-command": "npm ci",
        cache: "npm",
        scripts: '["test"]',
      },
    },
    release: { type: "node", version: "1.0.0" },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/stacks-node-ci.test.ts && npm test && npm run typecheck && npm run lint`
Expected: 5 new tests PASS; suite, typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/model.ts src/stacks src/commands/context.ts test/helpers.ts test/stacks-node-ci.test.ts
git commit -m "feat(stacks): report CI inputs and the release type from the node pack"
```

---

### Task 4: Reusable workflows and fixtures

**Files:**
- Create: `.github/workflows/stack-node.yml`, `.github/workflows/commitlint.yml`, `.github/workflows/release.yml`, `.github/workflows/workflow-tests.yml`, `fixtures/node/package.json`, `fixtures/node/index.test.mjs`, `fixtures/node/package-lock.json` (generated), `fixtures/node-pnpm/package.json`, `fixtures/node-pnpm/index.test.mjs`, `fixtures/node-pnpm/pnpm-lock.yaml` (generated), `test/workflows.test.ts`
- Modify: `biome.json`

**Interfaces:**
- Consumes: `nodeStack` and its `ci.with` keys (Task 3); `TOOL_VERSIONS`.
- Produces: reusable workflow files. `stack-node.yml` inputs: `node-versions`, `os`, `package-manager`, `install-command`, `cache`, `scripts`, `test-command`, `working-directory`. `release.yml`: secret `token`; outputs `release_created`, `tag_name`, `version`, `major`. `commitlint.yml`: no inputs.

- [ ] **Step 1: Add the fixtures**

`fixtures/node/package.json`:
```json
{
  "name": "fixture-node",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

`fixtures/node/index.test.mjs` (the same file goes to `fixtures/node-pnpm/index.test.mjs`):
```js
import assert from "node:assert/strict";
import { test } from "node:test";

test("the fixture runs", () => {
  assert.equal(1 + 1, 2);
});
```

`fixtures/node-pnpm/package.json`:
```json
{
  "name": "fixture-node-pnpm",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "scripts": { "test": "node --test" }
}
```

Generate the lockfiles:
```bash
(cd fixtures/node && npm install --package-lock-only --no-audit --no-fund)
(cd fixtures/node-pnpm && npx --yes pnpm@12.6.0 install --lockfile-only)
```
Expected: `fixtures/node/package-lock.json` and `fixtures/node-pnpm/pnpm-lock.yaml` exist; neither directory gets `node_modules`.

In `biome.json`, add `"!fixtures"` to `files.includes`.

- [ ] **Step 2: Write the failing contract test**

`test/workflows.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { nodeStack } from "../src/stacks/node.js";
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

const read = (name: string) => readFileSync(`.github/workflows/${name}`, "utf8");
const workflow = (name: string) => parse(read(name)) as Workflow;
const steps = (wf: Workflow) => Object.values(wf.jobs).flatMap((job) => job.steps ?? []);

describe.each(["stack-node.yml", "commitlint.yml", "release.yml"])("%s", (name) => {
  it("is a reusable workflow whose jobs all declare permissions", () => {
    const wf = workflow(name);
    expect(wf.on.workflow_call).toBeDefined();
    for (const job of Object.values(wf.jobs)) expect(job.permissions).toBeDefined();
  });

  it("pins every action by commit SHA", () => {
    const uses = steps(workflow(name)).flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });
});

it("stack-node accepts every input the node pack passes", async () => {
  const inputs = Object.keys(workflow("stack-node.yml").on.workflow_call?.inputs ?? {});
  const resolved = await nodeStack.resolve("fixtures/node");
  expect(inputs).toEqual(
    expect.arrayContaining([...Object.keys(resolved.ci?.with ?? {}), "working-directory", "test-command"]),
  );
});

it("stack-node keeps package scripts from reading the list of scripts", () => {
  const loop = steps(workflow("stack-node.yml")).find((step) => step.run?.includes("while IFS= read -r script"));
  expect(loop?.run).toContain('"$PM" run "$script" </dev/null');
});

it("workflow-tests calls stack-node with what the node pack resolves for each fixture", async () => {
  const jobs = workflow("workflow-tests.yml").jobs;
  const comparable = (inputs: Record<string, string> = {}) => {
    const { "working-directory": _dir, os: _os, "node-versions": _versions, ...rest } = inputs;
    return rest;
  };
  for (const [job, dir] of [
    ["node-npm", "fixtures/node"],
    ["node-pnpm", "fixtures/node-pnpm"],
  ] as const) {
    const resolved = await nodeStack.resolve(dir);
    expect(jobs[job]?.uses).toBe("./.github/workflows/stack-node.yml");
    expect(jobs[job]?.with?.["working-directory"]).toBe(dir);
    expect(comparable(jobs[job]?.with)).toEqual(comparable(resolved.ci?.with));
  }
});

it("commitlint uses the standard's tool versions and header rule", () => {
  const text = read("commitlint.yml");
  expect(text).toContain(`@commitlint/cli@${TOOL_VERSIONS.commitlintCli}`);
  expect(text).toContain(`@commitlint/config-conventional@${TOOL_VERSIONS.commitlintConventional}`);
  expect(text).toContain(`"header-max-length": [2, "always", 100]`);
});

it("release exposes the outputs callers use", () => {
  expect(Object.keys(workflow("release.yml").on.workflow_call?.outputs ?? {})).toEqual(
    expect.arrayContaining(["release_created", "tag_name", "version", "major"]),
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/workflows.test.ts`
Expected: FAIL — `ENOENT` for `.github/workflows/stack-node.yml`.

- [ ] **Step 4: Write the reusable workflows**

`.github/workflows/stack-node.yml`:
```yaml
name: stack-node

on:
  workflow_call:
    inputs:
      node-versions:
        description: JSON list of Node.js versions
        type: string
        default: '["22","24"]'
      os:
        description: JSON list of runner labels
        type: string
        default: '["ubuntu-latest"]'
      package-manager:
        description: npm, pnpm or yarn
        type: string
        default: npm
      install-command:
        description: Command that installs dependencies
        type: string
        default: npm ci
      cache:
        description: setup-node cache, "npm" or empty for none
        type: string
        default: npm
      scripts:
        description: JSON list of package scripts to run in order
        type: string
        default: '["test"]'
      test-command:
        description: Extra command run after the scripts
        type: string
        default: ""
      working-directory:
        description: Directory holding package.json
        type: string
        default: .

permissions:
  contents: read

jobs:
  node:
    name: node ${{ matrix.node }} (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(inputs.os) }}
        node: ${{ fromJSON(inputs.node-versions) }}
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
        working-directory: ${{ inputs.working-directory }}
    env:
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: ${{ matrix.node }}
          cache: ${{ inputs.cache }}
          cache-dependency-path: ${{ inputs.cache != '' && format('{0}/package-lock.json', inputs.working-directory) || '' }}
      - name: Enable corepack
        if: inputs.package-manager != 'npm'
        run: corepack enable
      - name: Install dependencies
        run: ${{ inputs.install-command }}
      - name: Run scripts
        env:
          PM: ${{ inputs.package-manager }}
          SCRIPTS: ${{ inputs.scripts }}
        run: |
          node -e 'for (const s of JSON.parse(process.env.SCRIPTS)) console.log(s)' | while IFS= read -r script; do
            echo "::group::$PM run $script"
            "$PM" run "$script" </dev/null
            echo "::endgroup::"
          done
      - name: Run the test command
        if: inputs.test-command != ''
        run: ${{ inputs.test-command }}
```

`.github/workflows/commitlint.yml`:
```yaml
name: commitlint

on:
  workflow_call: {}

permissions:
  contents: read

jobs:
  commitlint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: "24"
      - name: Install commitlint
        run: |
          dir="$RUNNER_TEMP/commitlint"
          mkdir -p "$dir"
          cd "$dir"
          echo '{ "private": true }' > package.json
          npm install --no-audit --no-fund @commitlint/cli@21.2.3 @commitlint/config-conventional@21.2.3
          cat > commitlint.config.mjs <<'EOF'
          export default {
            extends: ["@commitlint/config-conventional"],
            rules: { "header-max-length": [2, "always", 100] },
          };
          EOF
      - name: Check commit messages
        env:
          EVENT: ${{ github.event_name }}
          BASE: ${{ github.event.pull_request.base.sha }}
          HEAD: ${{ github.event.pull_request.head.sha }}
        run: |
          dir="$RUNNER_TEMP/commitlint"
          lint() { "$dir/node_modules/.bin/commitlint" --config "$dir/commitlint.config.mjs" --verbose "$@"; }
          if [ "$EVENT" = "pull_request" ]; then
            lint --from "$BASE" --to "$HEAD"
          else
            lint --last
          fi
```

`.github/workflows/release.yml`:
```yaml
name: release

on:
  workflow_call:
    secrets:
      token:
        description: Token for release-please. GITHUB_TOKEN is used when absent, but its pull requests do not trigger CI.
        required: false
    outputs:
      release_created:
        description: "'true' when this run created a release"
        value: ${{ jobs.release-please.outputs.release_created }}
      tag_name:
        description: Tag of the release, such as v1.2.0
        value: ${{ jobs.release-please.outputs.tag_name }}
      version:
        description: Version of the release, such as 1.2.0
        value: ${{ jobs.release-please.outputs.version }}
      major:
        description: Major version of the release
        value: ${{ jobs.release-please.outputs.major }}

permissions:
  contents: read

jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
      version: ${{ steps.release.outputs.version }}
      major: ${{ steps.release.outputs.major }}
    steps:
      - id: release
        uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0
        with:
          token: ${{ secrets.token || github.token }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

`.github/workflows/workflow-tests.yml` (repository-only; exercises `stack-node.yml` against the fixtures):
```yaml
name: workflow-tests

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  node-npm:
    uses: ./.github/workflows/stack-node.yml
    with:
      working-directory: fixtures/node
      os: '["ubuntu-latest","windows-latest"]'
      node-versions: '["22","24"]'
      package-manager: npm
      install-command: npm ci
      cache: npm
      scripts: '["test"]'
  node-pnpm:
    uses: ./.github/workflows/stack-node.yml
    with:
      working-directory: fixtures/node-pnpm
      os: '["ubuntu-latest"]'
      node-versions: '["24"]'
      package-manager: pnpm
      install-command: pnpm install --frozen-lockfile
      cache: ""
      scripts: '["test"]'
```

- [ ] **Step 5: Run the tests and try the commitlint setup locally**

Run: `npx vitest run test/workflows.test.ts && npm test && npm run lint`
Expected: 9 tests PASS in the new file; suite and lint clean.

Then reproduce the commitlint job's install and check in a scratch directory, from the repository root:
```bash
dir="$(mktemp -d)/commitlint" && mkdir -p "$dir" && (cd "$dir" && echo '{ "private": true }' > package.json && npm install --no-audit --no-fund @commitlint/cli@21.2.3 @commitlint/config-conventional@21.2.3 >/dev/null && printf 'export default {\n  extends: ["@commitlint/config-conventional"],\n  rules: { "header-max-length": [2, "always", 100] },\n};\n' > commitlint.config.mjs)
"$dir/node_modules/.bin/commitlint" --config "$dir/commitlint.config.mjs" --last --verbose; echo "exit=$?"
echo "bad message" | "$dir/node_modules/.bin/commitlint" --config "$dir/commitlint.config.mjs"; echo "exit=$?"
```
Expected: the last commit passes (`exit=0`); `bad message` fails with `subject may not be empty` (`exit=1`). This proves `extends` resolves from the config file's directory rather than the repository.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows fixtures biome.json test/workflows.test.ts
git commit -m "feat(workflows): add reusable node, commitlint and release workflows with fixtures"
```

---

### Task 5: `ci` module

**Files:**
- Create: `src/modules/ci.ts`, `test/modules-ci-release.test.ts`
- Modify: `src/version.ts`, `src/model.ts`, `src/platforms/github.ts`, `src/modules/index.ts`, `test/plan.test.ts`, `test/e2e.test.ts`

**Interfaces:**
- Consumes: `YamlOutput` (Task 1), `CiJob` and `ResolvedStack.ci` (Task 3), `makeContext`, `nodeResolved`, `syncOnce`.
- Produces:
  - `REUSABLE_REPO = "vannt-dev/repokeeper"`; `WORKFLOW_REF` (`v` + package major version)
  - `PlatformAdapter.ciWorkflow(ctx: ModuleContext): Output[]`
  - `ciModule: Module`
  - in `src/platforms/github.ts`: `WORKFLOW_KEYS`, `workflowRef(ctx, file)`, `workflowKey(module, path, keyPath, value)`, `defaultBranch(ctx)` (module-private helpers reused by Task 6)

- [ ] **Step 1: Write the failing tests**

`test/modules-ci-release.test.ts`:
```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Output } from "../src/model.js";
import { ciModule } from "../src/modules/ci.js";
import { WORKFLOW_REF } from "../src/version.js";
import { makeContext, nodeResolved, syncOnce, tempDir } from "./helpers.js";

const keys = (outputs: Output[]) =>
  Object.fromEntries(outputs.flatMap((o) => (o.kind === "yaml" ? [[o.keyPath.join("."), o.value]] : [])));

describe("ci module", () => {
  it("calls the reusable workflows at the moving major tag", () => {
    const out = keys(ciModule.outputs(makeContext()));
    expect(out.name).toBe("ci");
    expect(out.on).toEqual({ pull_request: {}, push: { branches: ["main"] } });
    expect(out.permissions).toEqual({ contents: "read" });
    expect(out["jobs.node"]).toEqual({
      uses: `vannt-dev/repokeeper/.github/workflows/stack-node.yml@${WORKFLOW_REF}`,
      with: nodeResolved().ci?.with,
    });
    expect(out["jobs.commits"]).toEqual({
      uses: `vannt-dev/repokeeper/.github/workflows/commitlint.yml@${WORKFLOW_REF}`,
    });
  });

  it("uses local references inside the repokeeper repository", () => {
    const out = keys(ciModule.outputs(makeContext({ repo: { owner: "vannt-dev", name: "repokeeper" } })));
    expect(out["jobs.node"]).toMatchObject({ uses: "./.github/workflows/stack-node.yml" });
    expect(out["jobs.commits"]).toEqual({ uses: "./.github/workflows/commitlint.yml" });
  });

  it("follows the configured default branch and drops the commits job with the commits module", () => {
    const ctx = makeContext({ config: { github: { default_branch: "trunk" } }, modules: { commits: false } });
    const out = keys(ciModule.outputs(ctx));
    expect(out.on).toEqual({ pull_request: {}, push: { branches: ["trunk"] } });
    expect(out["jobs.commits"]).toBeUndefined();
  });

  it("produces nothing when no job would run", () => {
    const ctx = makeContext({ modules: { commits: false }, stacks: [nodeResolved({ ci: null })] });
    expect(ciModule.outputs(ctx)).toEqual([]);
  });

  it("writes a workflow with its keys in the usual order", async () => {
    const root = await tempDir();
    await syncOnce(root, ciModule.outputs(makeContext()));
    const text = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(Object.keys(parse(text))).toEqual(["name", "on", "permissions", "jobs"]);
  });
});
```

Add to `test/e2e.test.ts`, inside the `describe` block, before the dry-run test:
```ts
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
```

In `test/plan.test.ts`, add `".github/workflows/ci.yml",` to the expected list in "plans every core output for a node repository", right after `".github/dependabot.yml",`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/modules-ci-release.test.ts test/plan.test.ts test/e2e.test.ts`
Expected: FAIL — cannot resolve `../src/modules/ci.js`; the plan and e2e tests fail on the missing `ci.yml`.

- [ ] **Step 3: Write the implementation**

In `src/version.ts`, add:
```ts
/** Repository hosting the reusable workflows that generated CI files call. */
export const REUSABLE_REPO = "vannt-dev/repokeeper";

/** Moving tag callers pin to: the major version of this repokeeper (v0 during 0.x). */
export const WORKFLOW_REF = `v${PACKAGE_VERSION.split(".")[0]}`;
```

In `src/model.ts`, add to `PlatformAdapter`:
```ts
  /** The caller CI workflow; empty when no job would run. */
  ciWorkflow(ctx: ModuleContext): Output[];
```

In `src/platforms/github.ts`, add `import { REUSABLE_REPO, WORKFLOW_REF } from "../version.js";`, extend the model import with `type Output` (already there) and add above `githubPlatform`:
```ts
const WORKFLOW_KEYS = ["name", "on", "permissions", "concurrency", "env", "defaults", "jobs"] as const;

/** Reference to a reusable workflow; local inside the repository that hosts them. */
function workflowRef(ctx: ModuleContext, file: string): string {
  const self = ctx.repo.owner !== null && `${ctx.repo.owner}/${ctx.repo.name}` === REUSABLE_REPO;
  return self ? `./.github/workflows/${file}` : `${REUSABLE_REPO}/.github/workflows/${file}@${WORKFLOW_REF}`;
}

const workflowKey = (module: string, path: string, keyPath: string[], value: unknown): Output => ({
  kind: "yaml",
  module,
  path,
  keyPath,
  value,
  order: WORKFLOW_KEYS,
});

function defaultBranch(ctx: ModuleContext): string {
  const branch = ctx.config.github?.default_branch;
  return typeof branch === "string" && branch.length > 0 ? branch : "main";
}
```
and add to the `githubPlatform` object:
```ts
  ciWorkflow(ctx: ModuleContext): Output[] {
    const path = ".github/workflows/ci.yml";
    const jobs: Output[] = [];
    for (const stack of ctx.stacks) {
      if (stack.ci) {
        jobs.push(
          workflowKey("ci", path, ["jobs", stack.id], { uses: workflowRef(ctx, stack.ci.workflow), with: stack.ci.with }),
        );
      }
    }
    if (ctx.config.modules.commits) {
      jobs.push(workflowKey("ci", path, ["jobs", "commits"], { uses: workflowRef(ctx, "commitlint.yml") }));
    }
    if (jobs.length === 0) return [];
    return [
      workflowKey("ci", path, ["name"], "ci"),
      workflowKey("ci", path, ["on"], { pull_request: {}, push: { branches: [defaultBranch(ctx)] } }),
      workflowKey("ci", path, ["permissions"], { contents: "read" }),
      ...jobs,
    ];
  },
```

`src/modules/ci.ts`:
```ts
import type { Module } from "../model.js";

export const ciModule: Module = {
  id: "ci",
  enabled: (config) => config.modules.ci,
  outputs: (ctx) => ctx.platform.ciWorkflow(ctx),
};
```

In `src/modules/index.ts`, import `ciModule` and append it to `MODULES`; change the comment to `/** \`release\` joins this list in Task 6 of the workflows plan. */` (Task 6 removes the comment).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/modules-ci-release.test.ts test/plan.test.ts test/e2e.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all PASS; typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(modules): add the ci module that calls the reusable workflows"
```

---

### Task 6: `release` module and standard 1.1.0

**Files:**
- Create: `src/modules/release.ts`
- Modify: `src/version.ts`, `src/model.ts`, `src/platforms/github.ts`, `src/modules/index.ts`, `test/modules-ci-release.test.ts`, `test/plan.test.ts`, `test/e2e.test.ts`

**Interfaces:**
- Consumes: `SeedOutput` (Task 2), `ReleaseInfo` (Task 3), `workflowKey`, `workflowRef`, `defaultBranch` (Task 5).
- Produces: `STANDARD_VERSION = "1.1.0"`; `PlatformAdapter.releaseAutomation(ctx, release: ReleaseInfo): Output[]`; `pickRelease(stacks: ResolvedStack[]): ReleaseInfo`; `releaseModule: Module`.

- [ ] **Step 1: Write the failing tests**

Append to `test/modules-ci-release.test.ts` (add `pickRelease, releaseModule` from `../src/modules/release.js` to the imports):
```ts
describe("release module", () => {
  it("configures release-please for the stack's release type and seeds the manifest", () => {
    const outputs = releaseModule.outputs(makeContext({ stacks: [nodeResolved({ release: { type: "node", version: "0.3.0" } })] }));
    const config = outputs.find((o) => o.path === "release-please-config.json");
    expect(config?.kind).toBe("file");
    expect(JSON.parse(config?.kind === "file" ? config.content : "")).toEqual({
      $schema: "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
      packages: {
        ".": {
          "release-type": "node",
          "changelog-path": "CHANGELOG.md",
          "bump-minor-pre-major": true,
          "include-component-in-tag": false,
        },
      },
    });
    const manifest = outputs.find((o) => o.path === ".release-please-manifest.json");
    expect(manifest).toMatchObject({ kind: "seed", content: '{\n  ".": "0.3.0"\n}\n' });
  });

  it("adds a release workflow that calls the reusable one with write permissions", () => {
    const out = keys(releaseModule.outputs(makeContext()));
    expect(out.name).toBe("release");
    expect(out.on).toEqual({ push: { branches: ["main"] } });
    expect(out.permissions).toEqual({ contents: "read" });
    expect(out["jobs.release"]).toEqual({
      uses: `vannt-dev/repokeeper/.github/workflows/release.yml@${WORKFLOW_REF}`,
      permissions: { contents: "write", "pull-requests": "write", issues: "write" },
      secrets: { token: "${{ secrets.RELEASE_PLEASE_TOKEN }}" },
    });
  });

  it("prefers a language release type and falls back to simple at 0.0.0", () => {
    const simple = nodeResolved({ id: "node", release: { type: "simple", version: null } });
    expect(pickRelease([simple, nodeResolved({ release: { type: "node", version: "2.0.0" } })])).toEqual({
      type: "node",
      version: "2.0.0",
    });
    expect(pickRelease([])).toEqual({ type: "simple", version: null });
    const manifest = releaseModule.outputs(makeContext({ stacks: [] })).find((o) => o.kind === "seed");
    expect(manifest).toMatchObject({ content: '{\n  ".": "0.0.0"\n}\n' });
  });
});
```

In `test/plan.test.ts`, the expected list in "plans every core output for a node repository" becomes:
```ts
  expect(paths()).toEqual([
    ".editorconfig",
    ".gitattributes",
    ".github/CODEOWNERS",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/dependabot.yml",
    ".github/pull_request_template.md",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    ".gitignore",
    ".release-please-manifest.json",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "SECURITY.md",
    "commitlint.config.mjs",
    "lefthook.yml",
    "package.json",
    "release-please-config.json",
  ]);
```

In `test/e2e.test.ts`: add `rm` to the `node:fs/promises` import, add `import { STANDARD_VERSION } from "../src/version.js";`, change the JSON check expectation to
```ts
    expect(JSON.parse(json.out)).toMatchObject({
      clean: true,
      standard: { config: STANDARD_VERSION, current: STANDARD_VERSION },
    });
```
and add inside the `describe` block:
```ts
  it("brings a repository initialised with standard 1.0.0 up to date", async () => {
    const dir = await nodeRepo();
    await repokeeper(dir, "init");
    // what repokeeper 0.1.0 left behind: no ci or release outputs, standard 1.0.0
    await rm(join(dir, ".github/workflows"), { recursive: true });
    await rm(join(dir, "release-please-config.json"));
    await rm(join(dir, ".release-please-manifest.json"));
    const lockPath = join(dir, ".repokeeper/lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.standard = "1.0.0";
    lock.entries = lock.entries.filter((e: { module: string }) => e.module !== "ci" && e.module !== "release");
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const configPath = join(dir, ".repokeeper.yml");
    await writeFile(configPath, (await readFile(configPath, "utf8")).replace(`standard: ${STANDARD_VERSION}`, "standard: 1.0.0"));
    commitAll(dir);

    expect((await repokeeper(dir, "check")).code).toBe(1);
    const updated = await repokeeper(dir, "update");
    expect(updated.code).toBe(0);
    expect(updated.out).toContain("create     .github/workflows/ci.yml (jobs.node)");
    expect(updated.out).toContain("create     .release-please-manifest.json");
    expect(await readFile(configPath, "utf8")).toContain(`standard: ${STANDARD_VERSION}`);
    commitAll(dir);
    expect((await repokeeper(dir, "check")).code).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/modules-ci-release.test.ts test/plan.test.ts test/e2e.test.ts`
Expected: FAIL — cannot resolve `../src/modules/release.js`.

- [ ] **Step 3: Write the implementation**

In `src/version.ts`: `export const STANDARD_VERSION = "1.1.0";`

In `src/model.ts`, add to `PlatformAdapter`:
```ts
  /** release-please configuration, its manifest and the caller release workflow. */
  releaseAutomation(ctx: ModuleContext, release: ReleaseInfo): Output[];
```

In `src/platforms/github.ts`, extend the model import with `type ReleaseInfo`, add above `githubPlatform`:
```ts
const RELEASE_PLEASE_SCHEMA = "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json";
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
```
and add to the `githubPlatform` object:
```ts
  releaseAutomation(ctx: ModuleContext, release: ReleaseInfo): Output[] {
    const path = ".github/workflows/release.yml";
    return [
      {
        kind: "file",
        module: "release",
        path: "release-please-config.json",
        content: json({
          $schema: RELEASE_PLEASE_SCHEMA,
          packages: {
            ".": {
              "release-type": release.type,
              "changelog-path": "CHANGELOG.md",
              "bump-minor-pre-major": true,
              "include-component-in-tag": false,
            },
          },
        }),
      },
      {
        kind: "seed",
        module: "release",
        path: ".release-please-manifest.json",
        content: json({ ".": release.version ?? "0.0.0" }),
      },
      workflowKey("release", path, ["name"], "release"),
      workflowKey("release", path, ["on"], { push: { branches: [defaultBranch(ctx)] } }),
      workflowKey("release", path, ["permissions"], { contents: "read" }),
      workflowKey("release", path, ["jobs", "release"], {
        uses: workflowRef(ctx, "release.yml"),
        permissions: { contents: "write", "pull-requests": "write", issues: "write" },
        secrets: { token: "${{ secrets.RELEASE_PLEASE_TOKEN }}" },
      }),
    ];
  },
```

`src/modules/release.ts`:
```ts
import type { Module, ReleaseInfo, ResolvedStack } from "../model.js";

/** One release per repository: the first stack with a language release type wins, otherwise `simple`. */
export function pickRelease(stacks: ResolvedStack[]): ReleaseInfo {
  return stacks.find((stack) => stack.release.type !== "simple")?.release ?? { type: "simple", version: null };
}

export const releaseModule: Module = {
  id: "release",
  enabled: (config) => config.modules.release,
  outputs: (ctx) => ctx.platform.releaseAutomation(ctx, pickRelease(ctx.stacks)),
};
```

In `src/modules/index.ts`, import `releaseModule`, append it to `MODULES` after `ciModule`, and delete the comment above `MODULES`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all PASS; typecheck, lint and build clean.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(modules): add release-please automation and move the standard to 1.1.0"
```

---

### Task 7: Move repokeeper onto its own workflows and open the pull request

**Files:**
- Modify: `.repokeeper.yml`, `package.json`, `biome.json`, `.github/workflows/ci.yml`, `README.md`, plus what `repokeeper update` writes (`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json`, `.repokeeper/lock.json`)

**Interfaces:**
- Consumes: the built CLI.

- [ ] **Step 1: Configure repokeeper for itself**

In `package.json` `scripts`, add after `"test"`: `"standard": "node dist/cli.js check",`.

In `.repokeeper.yml`, delete the `owned` comment and entry (leave `owned: []`) and replace `stack_options: {}` with:
```yaml
stack_options:
  node:
    os: [ubuntu-latest, windows-latest]
    scripts: [typecheck, lint, test, build, standard]
```

In `biome.json`, add `"!release-please-config.json"`, `"!.release-please-manifest.json"` and `"!CHANGELOG.md"` to `files.includes` (release-please rewrites them).

- [ ] **Step 2: Apply standard 1.1.0**

```bash
git add -A && git commit -m "chore(repokeeper): let repokeeper manage ci.yml and run its drift check in CI"
npm run build
node dist/cli.js update --dry-run
node dist/cli.js update
```
Expected: the dry run lists `create` for `.github/workflows/ci.yml (jobs.node)`, `.github/workflows/ci.yml (jobs.commits)`, the four release outputs and nothing as `conflict`; `name`, `on` and `permissions` of the existing `ci.yml` are `unchanged`. `update` exits 0 and moves `.repokeeper.yml` to `standard: 1.1.0`.

- [ ] **Step 3: Remove the hand-written CI job and add the publish job**

In `.github/workflows/ci.yml`, delete the `test:` job (everything from `  test:` to the line before `  node:` or `  commits:`); `jobs.node` now runs the same checks through `stack-node.yml`.

Append to `.github/workflows/release.yml` (under `jobs:`, after `release:`):
```yaml
  publish:
    needs: release
    if: ${{ needs.release.outputs.release_created == 'true' }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: "24"
          registry-url: https://registry.npmjs.org
          cache: npm
      - run: npm ci
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Move the major tag to this release
        env:
          TAG: ${{ needs.release.outputs.tag_name }}
          MAJOR: ${{ needs.release.outputs.major }}
        run: |
          git fetch --force origin "refs/tags/$TAG:refs/tags/$TAG"
          git tag -f "v$MAJOR" "$TAG"
          git push -f origin "refs/tags/v$MAJOR"
```

Run: `node dist/cli.js check`
Expected: `repository matches the standard` — the removed and added jobs are not repokeeper's.

- [ ] **Step 4: Document CI and releases**

In `README.md`, replace the first paragraph with:
```markdown
Keep every repository on one maintained standard: Conventional Commits, git hooks, community health
files, editor and gitignore settings, Dependabot, CI and releases — applied once and kept in sync as
the standard evolves.
```
and add before `## License`:
```markdown
## CI and releases

`ci.yml` calls reusable workflows from this repository (`stack-node.yml`, `commitlint.yml`) at the
moving major tag, so fixes reach every repository without a pull request. repokeeper owns the
`name`, `on` and `permissions` keys and the jobs it adds; jobs you add yourself are left alone.

`release.yml` runs [release-please](https://github.com/googleapis/release-please): it keeps a release
pull request open, and merging it tags the release and updates `CHANGELOG.md`. Two settings make this
work:

- In the repository settings, under Actions → General, allow GitHub Actions to create and approve
  pull requests.
- Optionally add a `RELEASE_PLEASE_TOKEN` secret (a fine-grained token with contents, pull requests
  and issues write access). Without it the release pull request is opened with `GITHUB_TOKEN`, and
  GitHub does not run CI on pull requests opened that way.
```

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build && node dist/cli.js check
git add -A
git commit -m "chore(repokeeper): update standard to 1.1.0 and publish releases to npm"
```
Expected: all green; the commit passes the `pre-commit` and `commit-msg` hooks.

- [ ] **Step 6: Push and open the pull request** (only after the owner agrees to push)

```bash
git push -u origin feat/workflows
gh pr create --base main --head feat/workflows --title "feat: reusable workflows, ci and release modules" --body-file - <<'EOF'
Implements plan 2 of the design: reusable `stack-node`, `commitlint` and `release` workflows, the
`ci` and `release` modules, `yaml` and `seed` outputs in the sync engine, and standard 1.1.0.
repokeeper now runs its own CI and releases through these workflows.

Before the first release the owner needs to:
- allow GitHub Actions to create and approve pull requests (Settings → Actions → General);
- add an `NPM_TOKEN` secret with publish rights for `repokeeper` (optionally `RELEASE_PLEASE_TOKEN`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr checks --watch
```
Expected: `ci` (node on ubuntu/windows × 22/24, commits) and `workflow-tests` (npm on ubuntu/windows × 22/24, pnpm on ubuntu) all pass. Merging waits for the owner.

---

### Task 8: First release and pilots (owner-gated)

Runs after Task 7's pull request is merged. Each step that changes GitHub or npm needs the owner's go-ahead.

- [ ] **Step 1: Owner prerequisites**

The owner enables "Allow GitHub Actions to create and approve pull requests" and adds the `NPM_TOKEN` secret (and optionally `RELEASE_PLEASE_TOKEN`). Check:
```bash
gh api repos/vannt-dev/repokeeper/actions/permissions/workflow --jq .can_approve_pull_request_reviews
gh secret list -R vannt-dev/repokeeper
```
Expected: `true`; `NPM_TOKEN` listed.

- [ ] **Step 2: Cut 0.2.0**

After the merge, the `release` workflow opens `chore(main): release 0.2.0`. Check it lists the plan 1 and plan 2 features, then the owner merges it.
```bash
gh pr list -R vannt-dev/repokeeper --label "autorelease: pending"
gh run watch -R vannt-dev/repokeeper
npm view repokeeper version
git ls-remote --tags origin v0
```
Expected: npm shows `0.2.0` with provenance; tag `v0` points at the `v0.2.0` commit.

- [ ] **Step 3: Pilot on token-efficient-work and convert-md-to-pdf**

For each repository, on a new branch `chore/repokeeper`:
```bash
npx repokeeper@0.2.0 init --dry-run
npx repokeeper@0.2.0 init            # add --adopt <path> for files the dry run lists as unmanaged and that should follow the standard
npm install                          # node repositories: installs lefthook and commitlint
npx repokeeper@0.2.0 check
```
Commit with `chore(repokeeper): apply standard 1.1.0`, push, open a pull request and watch its CI. A repository whose stack is not node yet (plan 3) keeps `stacks` limited to what repokeeper supports, or waits for plan 3.
Expected: `check` clean and CI green in both pilots. Record anything the pilots needed by hand as issues for plan 3.
