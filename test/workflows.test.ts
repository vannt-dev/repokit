import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { nodeStack } from "../src/stacks/node.js";
import { TOOL_VERSIONS } from "../src/version.js";

interface Step {
  uses?: string;
  run?: string;
}
interface Job {
  permissions?: unknown;
  steps?: Step[];
  uses?: string;
  with?: Record<string, string>;
}
interface Workflow {
  on: { workflow_call?: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> } };
  jobs: Record<string, Job>;
}

const read = (name: string) => readFileSync(`.github/workflows/${name}`, "utf8");
const workflow = (name: string) => parse(read(name)) as Workflow;
const steps = (wf: Workflow) => Object.values(wf.jobs).flatMap((job) => job.steps ?? []);

describe.each(["stack-node.yml", "commitlint.yml", "release-please.yml"])("%s", (name) => {
  it("is a reusable workflow whose jobs all declare permissions", () => {
    const wf = workflow(name);
    expect(wf.on.workflow_call).toBeDefined();
    for (const job of Object.values(wf.jobs)) expect(job.permissions).toBeDefined();
  });

  it("pins every action by commit SHA", () => {
    const uses = steps(workflow(name)).flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });
});

it("stack-node accepts every input the node pack passes", async () => {
  const inputs = Object.keys(workflow("stack-node.yml").on.workflow_call?.inputs ?? {});
  const resolved = await nodeStack.resolve("fixtures/node");
  expect(inputs).toEqual(
    expect.arrayContaining([...Object.keys(resolved.ci?.with ?? {}), "working-directory", "test-command"]),
  );
});

it("stack-node keeps package scripts from reading the list of scripts", () => {
  const loop = steps(workflow("stack-node.yml")).find((step) => step.run?.includes("while IFS= read -r script"));
  expect(loop?.run).toContain('"$PM" run "$script" </dev/null');
});

it("workflow-tests calls stack-node with what the node pack resolves for each fixture", async () => {
  const jobs = workflow("workflow-tests.yml").jobs;
  const comparable = (inputs: Record<string, string> = {}) => {
    const { "working-directory": _dir, os: _os, "node-versions": _versions, ...rest } = inputs;
    return rest;
  };
  for (const [job, dir] of [
    ["node-npm", "fixtures/node"],
    ["node-pnpm", "fixtures/node-pnpm"],
  ] as const) {
    const resolved = await nodeStack.resolve(dir);
    expect(jobs[job]?.uses).toBe("./.github/workflows/stack-node.yml");
    expect(jobs[job]?.with?.["working-directory"]).toBe(dir);
    expect(comparable(jobs[job]?.with)).toEqual(comparable(resolved.ci?.with));
  }
});

it("commitlint uses the standard's tool versions and header rule", () => {
  const text = read("commitlint.yml");
  expect(text).toContain(`@commitlint/cli@${TOOL_VERSIONS.commitlintCli}`);
  expect(text).toContain(`@commitlint/config-conventional@${TOOL_VERSIONS.commitlintConventional}`);
  expect(text).toContain(`"header-max-length": [2, "always", 100]`);
});

it("release exposes the outputs callers use", () => {
  expect(Object.keys(workflow("release-please.yml").on.workflow_call?.outputs ?? {})).toEqual(
    expect.arrayContaining(["release_created", "tag_name", "version", "major"]),
  );
});
