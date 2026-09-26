import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FILE } from "../config/load.js";
import { ConfigError, UsageError } from "../errors.js";
import type { StagedJob } from "../model.js";
import type { StackOptions, StackPack } from "./types.js";

const NPM_PLACEHOLDER_TEST = 'echo "Error: no test specified" && exit 1';

interface PackageJson {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

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

export const nodeStack: StackPack = {
  id: "node",
  detect: ["package.json"],
  async resolve(root, options = {}) {
    checkKeys(options);
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
  },
};
