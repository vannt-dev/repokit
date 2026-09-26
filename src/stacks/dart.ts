import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkKeys, readText, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["versions", "os"];

export const dartStack: StackPack = {
  id: "dart",
  detect: (root) => existsSync(join(root, "pubspec.yaml")),
  async resolve(root, options = {}) {
    checkKeys("dart", options, OPTION_KEYS);
    const pubspec = (await readText(root, "pubspec.yaml")) ?? "";
    const flutter = /sdk:\s*flutter\b/.test(pubspec);
    const tool = flutter ? "flutter" : "dart";
    const test = existsSync(join(root, "test")) ? `${tool} test` : null;
    const commands = ["dart format --output=none --set-exit-if-changed .", `${tool} analyze`, ...(test ? [test] : [])];
    return {
      id: "dart",
      staged: [{ name: "dart:format", glob: "*.dart", run: "dart format {staged_files}" }],
      test,
      install: `${tool} pub get`,
      gitignore: ["Dart"],
      dependabot: ["pub"],
      ci: {
        workflow: "stack-dart.yml",
        with: {
          "sdk-versions": JSON.stringify(stringList("dart", options, "versions") ?? ["stable"]),
          os: JSON.stringify(stringList("dart", options, "os") ?? ["ubuntu-latest"]),
          flutter: String(flutter),
          "install-command": `${tool} pub get`,
          commands: JSON.stringify(commands),
        },
      },
      release: { type: "dart", version: /^version:\s*(\S+)/m.exec(pubspec)?.[1] ?? null },
    };
  },
};
