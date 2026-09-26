# repokeeper

Keep every repository on one maintained standard: Conventional Commits, git hooks, community health
files, editor and gitignore settings, Dependabot, CI and releases — applied once and kept in sync as
the standard evolves.

> Status: early development. Supported stacks: Node.js (including NestJS), Python, Dart and
> Flutter, shell and PowerShell scripts, Java (Maven and Gradle) and .NET, each with CI and releases.
> GitHub settings are on the way. See the [design](docs/superpowers/specs/2026-09-25-repokeeper-design.md).

## Usage

repokeeper is not on npm yet. Until the first release, build it from source and link the command:

```bash
git clone https://github.com/vannt-dev/repokeeper.git
cd repokeeper && npm ci && npm run build && npm link
```

Then, in the repository you want to standardise (commit your work first — repokeeper refuses to
write over uncommitted or untracked files unless you pass `--force`):

```bash
repokeeper init     # detect the stack, write .repokeeper.yml, apply the standard
repokeeper check    # report drift; exits 1 when the repository has drifted
repokeeper update   # move to the latest standard without overwriting your edits
```

`init` never overwrites a file you already have: it reports it as unmanaged. Pass
`--adopt <path>` to let repokeeper manage it, or list it under `owned` in `.repokeeper.yml` to keep it
yours. Every write command accepts `--dry-run`.

Requires Node.js 22.12 or newer.

## CI and releases

`ci.yml` and `release.yml` call reusable workflows from this repository (`stack-node.yml`,
`commitlint.yml`, `release-please.yml`) at the moving major tag, so fixes reach every repository
without a pull request. repokeeper owns the `name`, `on` and `permissions` keys and the jobs it
adds; jobs you add yourself are left alone.

`release.yml` runs [release-please](https://github.com/googleapis/release-please): it keeps a release
pull request open, and merging it tags the release and updates `CHANGELOG.md`. Two settings make this
work:

- In the repository settings, under Actions → General, allow GitHub Actions to create and approve
  pull requests.
- Optionally add a `RELEASE_PLEASE_TOKEN` secret (a fine-grained token with contents, pull requests
  and issues write access). Without it the release pull request is opened with `GITHUB_TOKEN`, and
  GitHub does not run CI on pull requests opened that way.

## License

MIT
