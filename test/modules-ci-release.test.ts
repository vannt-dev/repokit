import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Output } from "../src/model.js";
import { ciModule } from "../src/modules/ci.js";
import { WORKFLOW_REF } from "../src/version.js";
import { makeContext, nodeResolved, syncOnce, tempDir } from "./helpers.js";

const keys = (outputs: Output[]) =>
  Object.fromEntries(outputs.flatMap((o) => (o.kind === "yaml" ? [[o.keyPath.join("."), o.value]] : [])));

describe("ci module", () => {
  it("calls the reusable workflows at the moving major tag", () => {
    const out = keys(ciModule.outputs(makeContext()));
    expect(out.name).toBe("ci");
    expect(out.on).toEqual({ pull_request: {}, push: { branches: ["main"] } });
    expect(out.permissions).toEqual({ contents: "read" });
    expect(out["jobs.node"]).toEqual({
      uses: `vannt-dev/repokeeper/.github/workflows/stack-node.yml@${WORKFLOW_REF}`,
      with: nodeResolved().ci?.with,
    });
    expect(out["jobs.commits"]).toEqual({
      uses: `vannt-dev/repokeeper/.github/workflows/commitlint.yml@${WORKFLOW_REF}`,
    });
  });

  it("uses local references inside the repokeeper repository", () => {
    const out = keys(ciModule.outputs(makeContext({ repo: { owner: "vannt-dev", name: "repokeeper" } })));
    expect(out["jobs.node"]).toMatchObject({ uses: "./.github/workflows/stack-node.yml" });
    expect(out["jobs.commits"]).toEqual({ uses: "./.github/workflows/commitlint.yml" });
  });

  it("follows the configured default branch and drops the commits job with the commits module", () => {
    const ctx = makeContext({ config: { github: { default_branch: "trunk" } }, modules: { commits: false } });
    const out = keys(ciModule.outputs(ctx));
    expect(out.on).toEqual({ pull_request: {}, push: { branches: ["trunk"] } });
    expect(out["jobs.commits"]).toBeUndefined();
  });

  it("produces nothing when no job would run", () => {
    const ctx = makeContext({ modules: { commits: false }, stacks: [nodeResolved({ ci: null })] });
    expect(ciModule.outputs(ctx)).toEqual([]);
  });

  it("writes a workflow with its keys in the usual order", async () => {
    const root = await tempDir();
    await syncOnce(root, ciModule.outputs(makeContext()));
    const text = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(Object.keys(parse(text))).toEqual(["name", "on", "permissions", "jobs"]);
  });
});
