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
