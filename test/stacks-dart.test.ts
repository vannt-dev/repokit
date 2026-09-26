import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { dartStack } from "../src/stacks/dart.js";
import { tempDir } from "./helpers.js";

async function repo(files: Record<string, string>, dirs: string[] = []): Promise<string> {
  const dir = await tempDir();
  for (const d of dirs) await mkdir(join(dir, d), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

it("is detected from pubspec.yaml", async () => {
  expect(dartStack.detect(await repo({ "pubspec.yaml": "name: demo\n" }))).toBe(true);
  expect(dartStack.detect(await repo({ "main.dart": "" }))).toBe(false);
});

it("formats, analyzes and tests a Dart package with the dart tool", async () => {
  const stack = await dartStack.resolve(
    await repo({ "pubspec.yaml": "name: demo\nversion: 1.2.0\nenvironment:\n  sdk: ^3.5.0\n" }, ["test"]),
  );
  expect(stack.ci).toEqual({
    workflow: "stack-dart.yml",
    with: {
      "sdk-versions": '["stable"]',
      os: '["ubuntu-latest"]',
      flutter: "false",
      "install-command": "dart pub get",
      commands: '["dart format --output=none --set-exit-if-changed .","dart analyze","dart test"]',
    },
  });
  expect(stack.staged).toEqual([{ name: "dart:format", glob: "*.dart", run: "dart format {staged_files}" }]);
  expect(stack.test).toBe("dart test");
  expect(stack.install).toBe("dart pub get");
  expect(stack.release).toEqual({ type: "dart", version: "1.2.0" });
  expect(stack.gitignore).toEqual(["Dart"]);
  expect(stack.dependabot).toEqual(["pub"]);
});

it("uses flutter for a Flutter app and skips tests without a test directory", async () => {
  const stack = await dartStack.resolve(
    await repo({ "pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n" }),
  );
  expect(stack.ci?.with).toMatchObject({
    flutter: "true",
    "install-command": "flutter pub get",
    commands: '["dart format --output=none --set-exit-if-changed .","flutter analyze"]',
  });
  expect(stack.test).toBeNull();
  expect(stack.release.version).toBeNull();
});
