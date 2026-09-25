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
