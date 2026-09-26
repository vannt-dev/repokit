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
