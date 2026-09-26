import type { RepokitConfig, StackId } from "./config/types.js";
import type { CommentStyle } from "./sync/block.js";

export const MANAGED_HEADER =
  "Managed by repokit (https://github.com/vannt-dev/repokit). Edits are reported by `repokit check`.";

export interface FileOutput {
  kind: "file";
  path: string;
  content: string;
  module: string;
}
export interface BlockOutput {
  kind: "block";
  path: string;
  id: string;
  body: string;
  comment: CommentStyle;
  module: string;
}
export interface JsonOutput {
  kind: "json";
  path: string;
  keyPath: string[];
  value: unknown;
  module: string;
}
export type Output = FileOutput | BlockOutput | JsonOutput;

export function outputId(output: Output): string {
  if (output.kind === "file") return `file:${output.path}`;
  if (output.kind === "block") return `block:${output.path}#${output.id}`;
  return `json:${output.path}#${JSON.stringify(output.keyPath)}`;
}

export function describeOutput(output: Output): string {
  if (output.kind === "file") return output.path;
  if (output.kind === "block") return `${output.path} (block ${output.id})`;
  return `${output.path} (${output.keyPath.join(".")})`;
}

export interface StagedJob {
  name: string;
  glob: string;
  run: string;
}

export interface ResolvedStack {
  id: StackId;
  /** lefthook pre-commit jobs; `{staged_files}` is filled in by lefthook. */
  staged: StagedJob[];
  /** Command for the pre-push test hook, or null when the repository has no tests. */
  test: string | null;
  /** Command that installs dependencies, quoted in CONTRIBUTING.md. */
  install: string | null;
  /** Template names under templates/gitignore/. */
  gitignore: string[];
  /** Dependabot package ecosystems. */
  dependabot: string[];
}

export interface RepoInfo {
  owner: string | null;
  name: string;
}

export interface PlatformAdapter {
  id: "github";
  communityFiles(ctx: ModuleContext): Output[];
  dependencyUpdates(ecosystems: string[]): Output[];
}

export interface ModuleContext {
  config: RepokitConfig;
  stacks: ResolvedStack[];
  platform: PlatformAdapter;
  repo: RepoInfo;
}

export interface Module {
  id: string;
  enabled(config: RepokitConfig): boolean;
  outputs(ctx: ModuleContext): Output[];
}
