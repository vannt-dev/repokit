import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { scriptStack } from "../src/stacks/script.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>): Promise<string> {
  const dir = await tempDir();
  await mkdir(join(dir, "scripts"), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

it("is detected from shell or PowerShell scripts at the root or in scripts/", async () => {
  expect(scriptStack.detect(await repo({ "build.sh": "" }))).toBe(true);
  expect(scriptStack.detect(await repo({ "scripts/setup.ps1": "" }))).toBe(true);
  expect(scriptStack.detect(await repo({ "README.md": "" }))).toBe(false);
});

it("checks both kinds of script in CI and runs the declared test command", async () => {
  const stack = await scriptStack.resolve(await repo({ "install.sh": "", "scripts/setup.ps1": "" }), {
    test: "./test.sh",
  });
  expect(stack.ci).toEqual({
    workflow: "stack-script.yml",
    with: { "shell-scripts": "true", "powershell-scripts": "true", "test-command": "./test.sh" },
  });
  expect(stack.test).toBe("./test.sh");
  expect(stack.staged).toEqual([]);
  expect(stack.install).toBeNull();
  expect(stack.gitignore).toEqual([]);
  expect(stack.dependabot).toEqual([]);
  expect(stack.release).toEqual({ type: "simple", version: null });
});

it("leaves out checks for a kind of script the repository does not have", async () => {
  const stack = await scriptStack.resolve(await repo({ "run.sh": "" }));
  expect(stack.ci?.with).toEqual({ "shell-scripts": "true", "powershell-scripts": "false", "test-command": "" });
  expect(stack.test).toBeNull();
});
