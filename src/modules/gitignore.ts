import type { Module } from "../model.js";
import { readTemplate } from "../templates.js";

export const gitignoreModule: Module = {
  id: "gitignore",
  enabled: (config) => config.modules.gitignore,
  outputs(ctx) {
    const names = [...new Set(ctx.stacks.flatMap((s) => s.gitignore))];
    const sections = names.map((n) => `## ${n} (github/gitignore)\n${readTemplate(`gitignore/${n}.gitignore`).trim()}`);
    sections.push("## repokit\n*.repokit-new");
    return [
      {
        kind: "block",
        module: "gitignore",
        path: ".gitignore",
        id: "gitignore",
        comment: "hash",
        body: sections.join("\n\n"),
      },
    ];
  },
};
