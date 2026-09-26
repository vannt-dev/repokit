import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ReleaseInfo } from "../model.js";
import { checkKeys, readText, stringList } from "./support.js";
import type { StackPack } from "./types.js";

const OPTION_KEYS = ["versions", "os"];

/** The project's own <version>: parent, dependency and plugin versions are removed first. */
function mavenVersion(pom: string): string | null {
  const own = pom.replace(/<(parent|dependencies|dependencyManagement|build|profiles|reporting)>[\s\S]*?<\/\1>/g, "");
  const version = /<version>\s*([^<\s]+)\s*<\/version>/.exec(own)?.[1];
  return version && !version.includes("${") ? version : null;
}

export const javaStack: StackPack = {
  id: "java",
  detect: (root) => ["pom.xml", "build.gradle", "build.gradle.kts"].some((f) => existsSync(join(root, f))),
  async resolve(root, options = {}) {
    checkKeys("java", options, OPTION_KEYS);
    const has = (path: string) => existsSync(join(root, path));
    const maven = has("pom.xml");
    let command: string;
    let release: ReleaseInfo;
    if (maven) {
      command = has("mvnw") ? "./mvnw -B verify" : "mvn -B verify";
      release = { type: "maven", version: mavenVersion((await readText(root, "pom.xml")) ?? "") };
    } else {
      command = has("gradlew") ? "./gradlew check" : "gradle check";
      const properties = await readText(root, "gradle.properties");
      const version = properties ? (/^version\s*=\s*(\S+)/m.exec(properties)?.[1] ?? null) : null;
      // release-please's generic updater changes gradle.properties once it carries x-release-please markers
      release = { type: "simple", version, ...(properties !== null ? { extraFiles: ["gradle.properties"] } : {}) };
    }
    return {
      id: "java",
      // formatting runs through the build (Spotless), not per staged file
      staged: [],
      test: command,
      install: null,
      gitignore: ["Java", maven ? "Maven" : "Gradle"],
      dependabot: [maven ? "maven" : "gradle"],
      ci: {
        workflow: "stack-java.yml",
        with: {
          "java-versions": JSON.stringify(stringList("java", options, "versions") ?? ["17", "21"]),
          os: JSON.stringify(stringList("java", options, "os") ?? ["ubuntu-latest"]),
          "build-tool": maven ? "maven" : "gradle",
          "gradle-version": !maven && !has("gradlew") ? "current" : "",
          commands: JSON.stringify([command]),
        },
      },
      release,
    };
  },
};
