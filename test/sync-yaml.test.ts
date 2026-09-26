import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Output, YAML_HEADER } from "../src/model.js";
import { deleteYamlKey, readYamlKey, setYamlKey } from "../src/sync/yaml.js";
import { syncOnce, tempDir } from "./helpers.js";

const ORDER = ["name", "on", "jobs"];
const options = { header: "Managed.", order: ORDER };

describe("yaml keys", () => {
  it("creates a file with the header and keys in the given order", () => {
    let text = setYamlKey(null, "ci.yml", ["jobs", "node"], { uses: "x" }, options);
    text = setYamlKey(text, "ci.yml", ["name"], "ci", options);
    expect(text.startsWith("# Managed.\n")).toBe(true);
    expect(Object.keys(parse(text))).toEqual(["name", "jobs"]);
    expect(parse(text)).toEqual({ name: "ci", jobs: { node: { uses: "x" } } });
  });

  it("reads a key as JSON text, and null when it is absent", () => {
    const text = "name: ci\non:\n  pull_request: {}\n";
    expect(readYamlKey(text, ["on"], "ci.yml")).toBe('{"pull_request":{}}');
    expect(readYamlKey(text, ["jobs", "node"], "ci.yml")).toBeNull();
  });

  it("keeps comments, the user's keys and CRLF when replacing a key", () => {
    const text =
      "name: ci\r\n# my comment\r\njobs:\r\n  mine:\r\n    runs-on: ubuntu-latest\r\n  node:\r\n    uses: old\r\n";
    const next = setYamlKey(text, "ci.yml", ["jobs", "node"], { uses: "new" }, options);
    expect(next).toContain("# my comment\r\n");
    expect(next.replace(/\r\n/g, "")).not.toContain("\n");
    expect(parse(next)).toEqual({ name: "ci", jobs: { mine: { "runs-on": "ubuntu-latest" }, node: { uses: "new" } } });
  });

  it("writes null as an empty value, the way workflows spell `pull_request:`", () => {
    expect(setYamlKey(null, "ci.yml", ["on"], { pull_request: null }, options)).toContain("on:\n  pull_request:\n");
  });

  it("does not fold long commands", () => {
    const run = `echo ${"x".repeat(200)}`;
    expect(setYamlKey(null, "a.yml", ["run"], run, options)).toContain(`run: ${run}\n`);
  });

  it("deletes a key and the parents it empties, then reports an empty document", () => {
    const once = deleteYamlKey("name: ci\njobs:\n  node:\n    uses: x\n", "ci.yml", ["jobs", "node"]);
    expect(parse(once as string)).toEqual({ name: "ci" });
    expect(deleteYamlKey(once as string, "ci.yml", ["name"])).toBeNull();
  });

  it("names the file when the YAML is invalid", () => {
    expect(() => readYamlKey("jobs: [a\n", ["jobs"], "ci.yml")).toThrow("ci.yml is not valid YAML");
  });
});

describe("yaml outputs through the sync engine", () => {
  const path = ".github/workflows/ci.yml";
  const job = (uses: string): Output => ({
    kind: "yaml",
    module: "ci",
    path,
    keyPath: ["jobs", "node"],
    value: { uses },
    order: ORDER,
  });
  const actions = async (root: string, outputs: Output[]) =>
    (await syncOnce(root, outputs)).decisions.map((d) => d.action);

  it("creates its key, leaves the user's jobs alone, reports edits and removes only its key", async () => {
    const root = await tempDir();
    const file = join(root, path);
    expect(await actions(root, [job("a")])).toEqual(["create"]);
    expect((await readFile(file, "utf8")).startsWith(`# ${YAML_HEADER}\n`)).toBe(true);

    await writeFile(file, `${await readFile(file, "utf8")}  mine:\n    runs-on: ubuntu-latest\n`);
    expect(await actions(root, [job("a")])).toEqual(["unchanged"]);
    expect(await actions(root, [job("b")])).toEqual(["write"]);

    await writeFile(file, (await readFile(file, "utf8")).replace("uses: b", "uses: edited"));
    expect(await actions(root, [job("c")])).toEqual(["conflict"]);
    expect(await readFile(file, "utf8")).toContain("uses: edited");

    await writeFile(file, (await readFile(file, "utf8")).replace("uses: edited", "uses: b"));
    const removed = await syncOnce(root, []);
    expect(removed.removals.map((r) => r.action)).toEqual(["delete"]);
    expect(parse(await readFile(file, "utf8"))).toEqual({ jobs: { mine: { "runs-on": "ubuntu-latest" } } });
  });
});
