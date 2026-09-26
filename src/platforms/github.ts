import { stringify } from "yaml";
import { MANAGED_HEADER, type ModuleContext, type Output, type PlatformAdapter } from "../model.js";
import { REUSABLE_REPO, WORKFLOW_REF } from "../version.js";

const yamlFile = (module: string, path: string, data: unknown): Output => ({
  kind: "file",
  module,
  path,
  content: `# ${MANAGED_HEADER}\n${stringify(data)}`,
});

const WORKFLOW_KEYS = ["name", "on", "permissions", "concurrency", "env", "defaults", "jobs"] as const;

/** Reference to a reusable workflow; local inside the repository that hosts them. */
function workflowRef(ctx: ModuleContext, file: string): string {
  const self = ctx.repo.owner !== null && `${ctx.repo.owner}/${ctx.repo.name}` === REUSABLE_REPO;
  return self ? `./.github/workflows/${file}` : `${REUSABLE_REPO}/.github/workflows/${file}@${WORKFLOW_REF}`;
}

const workflowKey = (module: string, path: string, keyPath: string[], value: unknown): Output => ({
  kind: "yaml",
  module,
  path,
  keyPath,
  value,
  order: WORKFLOW_KEYS,
});

function defaultBranch(ctx: ModuleContext): string {
  const branch = ctx.config.github?.default_branch;
  return typeof branch === "string" && branch.length > 0 ? branch : "main";
}

export const githubPlatform: PlatformAdapter = {
  id: "github",

  communityFiles(ctx: ModuleContext): Output[] {
    const { owner, name } = ctx.repo;
    const outputs: Output[] = [
      yamlFile("health", ".github/ISSUE_TEMPLATE/bug_report.yml", {
        name: "Bug report",
        description: "Report something that does not work as expected",
        labels: ["bug"],
        body: [
          {
            type: "textarea",
            id: "what-happened",
            attributes: { label: "What happened?", description: "Include the steps to reproduce it." },
            validations: { required: true },
          },
          {
            type: "textarea",
            id: "expected",
            attributes: { label: "What did you expect?" },
            validations: { required: true },
          },
          { type: "input", id: "version", attributes: { label: "Version" } },
        ],
      }),
      yamlFile("health", ".github/ISSUE_TEMPLATE/feature_request.yml", {
        name: "Feature request",
        description: "Suggest an improvement",
        labels: ["enhancement"],
        body: [
          {
            type: "textarea",
            id: "problem",
            attributes: { label: "What problem would this solve?" },
            validations: { required: true },
          },
          { type: "textarea", id: "proposal", attributes: { label: "What do you propose?" } },
        ],
      }),
      yamlFile("health", ".github/ISSUE_TEMPLATE/config.yml", {
        blank_issues_enabled: false,
        contact_links: owner
          ? [
              {
                name: "Report a security vulnerability",
                url: `https://github.com/${owner}/${name}/security/advisories/new`,
                about: "Please report vulnerabilities privately.",
              },
            ]
          : [],
      }),
      {
        kind: "file",
        module: "health",
        path: ".github/pull_request_template.md",
        content: `<!-- ${MANAGED_HEADER} -->\n\n## Summary\n\n## Testing\n\n- [ ] Tests added or updated\n- [ ] Commit messages follow Conventional Commits\n`,
      },
    ];
    const health = ctx.config.modules.health;
    if (health && health.codeowners.length > 0) {
      outputs.push({
        kind: "file",
        module: "health",
        path: ".github/CODEOWNERS",
        content: `# ${MANAGED_HEADER}\n* ${health.codeowners.join(" ")}\n`,
      });
    }
    return outputs;
  },

  dependencyUpdates(ecosystems: string[]): Output[] {
    const updates = [...new Set([...ecosystems, "github-actions"])].map((ecosystem) => ({
      "package-ecosystem": ecosystem,
      directory: "/",
      schedule: { interval: "weekly" },
      groups: { [`${ecosystem}-minor-and-patch`]: { "update-types": ["minor", "patch"] } },
    }));
    return [yamlFile("deps", ".github/dependabot.yml", { version: 2, updates })];
  },

  ciWorkflow(ctx: ModuleContext): Output[] {
    const path = ".github/workflows/ci.yml";
    const jobs: Output[] = [];
    for (const stack of ctx.stacks) {
      if (stack.ci) {
        jobs.push(
          workflowKey("ci", path, ["jobs", stack.id], {
            uses: workflowRef(ctx, stack.ci.workflow),
            with: stack.ci.with,
          }),
        );
      }
    }
    if (ctx.config.modules.commits) {
      jobs.push(workflowKey("ci", path, ["jobs", "commits"], { uses: workflowRef(ctx, "commitlint.yml") }));
    }
    if (jobs.length === 0) return [];
    return [
      workflowKey("ci", path, ["name"], "ci"),
      workflowKey("ci", path, ["on"], { pull_request: {}, push: { branches: [defaultBranch(ctx)] } }),
      workflowKey("ci", path, ["permissions"], { contents: "read" }),
      ...jobs,
    ];
  },
};
