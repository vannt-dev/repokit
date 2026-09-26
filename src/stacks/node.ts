import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UsageError } from "../errors.js";
import type { StagedJob } from "../model.js";
import { checkKeys, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const NPM_PLACEHOLDER_TEST = 'echo "Error: no test specified" && exit 1';

interface PackageJson {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const OPTION_KEYS = ["versions", "os", "scripts"];
const CI_SCRIPTS = ["typecheck", "lint", "test", "build"];
/** NestJS projects scaffold end-to-end tests as a separate script. */
const NEST_CI_SCRIPTS = ["typecheck", "lint", "test", "test:e2e", "build"];

export const nodeStack: StackPack = {
  id: "node",
  detect: (root) => existsSync(join(root, "package.json")),
  async resolve(root, options = {}) {
    checkKeys("node", options, OPTION_KEYS);
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
      stringList("node", options, "scripts") ??
      (existsSync(join(root, "nest-cli.json")) ? NEST_CI_SCRIPTS : CI_SCRIPTS).filter((name) =>
        name === "test" ? hasTest : pkg.scripts?.[name] !== undefined,
      );
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
          "node-versions": JSON.stringify(stringList("node", options, "versions") ?? ["22", "24"]),
          os: JSON.stringify(stringList("node", options, "os") ?? ["ubuntu-latest"]),
          "package-manager": pm,
          "install-command": ciInstall,
          // setup-node can only cache npm here: pnpm and yarn come from corepack after it runs
          cache: pm === "npm" && npmLock ? "npm" : "",
          scripts: JSON.stringify(scripts),
        },
      },
      release: { type: "node", version: typeof pkg.version === "string" ? pkg.version : null },
    };
  },
};
