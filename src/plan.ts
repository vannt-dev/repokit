import { type Module, type ModuleContext, type Output, outputId } from "./model.js";
import { MODULES } from "./modules/index.js";

const toPosix = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "");

/** Pure: the outputs the standard asks for, given the config and resolved stacks. */
export function planOutputs(ctx: ModuleContext, modules: Module[] = MODULES): Output[] {
  const owned = new Set(ctx.config.owned.map(toPosix));
  const outputs = modules
    .filter((module) => module.enabled(ctx.config))
    .flatMap((module) => module.outputs(ctx))
    .filter((output) => !owned.has(output.path));
  const seen = new Set<string>();
  for (const output of outputs) {
    const id = outputId(output);
    if (seen.has(id)) throw new Error(`two modules produce ${id}`);
    seen.add(id);
  }
  return outputs.sort((a, b) => outputId(a).localeCompare(outputId(b)));
}
