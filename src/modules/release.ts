import type { Module, ReleaseInfo, ResolvedStack } from "../model.js";

/** One release per repository: the first stack with a language release type wins, otherwise the first stack's `simple` release (which may name extra files). */
export function pickRelease(stacks: ResolvedStack[]): ReleaseInfo {
  const language = stacks.find((stack) => stack.release.type !== "simple");
  return language?.release ?? stacks[0]?.release ?? { type: "simple", version: null };
}

export const releaseModule: Module = {
  id: "release",
  enabled: (config) => config.modules.release,
  outputs: (ctx) => ctx.platform.releaseAutomation(ctx, pickRelease(ctx.stacks)),
};
