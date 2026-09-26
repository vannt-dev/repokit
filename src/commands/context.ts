import type { RepokeeperConfig } from "../config/types.js";
import { repoInfo } from "../git.js";
import type { ModuleContext, RepoInfo } from "../model.js";
import { githubPlatform } from "../platforms/github.js";
import { getStackPack } from "../stacks/index.js";

export async function buildContext(root: string, config: RepokeeperConfig, repo?: RepoInfo): Promise<ModuleContext> {
  const stacks = await Promise.all(
    config.stacks.map((id) => getStackPack(id).resolve(root, config.stack_options[id] ?? {})),
  );
  return { config, stacks, platform: githubPlatform, repo: repo ?? (await repoInfo(root)) };
}
