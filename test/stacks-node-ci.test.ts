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
    {
      version: "1.4.0",
      scripts: { dev: "vite", build: "tsc", test: "vitest", lint: "biome check .", typecheck: "tsc --noEmit" },
    },
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

it("adds the NestJS end-to-end tests when nest-cli.json is present", async () => {
  const scripts = {
    lint: "eslint .",
    test: "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    build: "nest build",
  };
  const nest = await repo({ scripts }, { "nest-cli.json": "{}", "package-lock.json": "{}" });
  expect((await nodeStack.resolve(nest)).ci?.with.scripts).toBe('["lint","test","test:e2e","build"]');
  const plain = await repo({ scripts });
  expect((await nodeStack.resolve(plain)).ci?.with.scripts).toBe('["lint","test","build"]');
});
