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
      outputs.push({
        kind: "json",
        module: "hooks",
        path: "package.json",
        keyPath: ["devDependencies", "lefthook"],
        value: `^${TOOL_VERSIONS.lefthook}`,
      });
    }
    return outputs;
  },
};
