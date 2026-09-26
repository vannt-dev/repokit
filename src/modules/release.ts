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
