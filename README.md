# repokit

Keep every repository on one maintained standard: Conventional Commits, git hooks, community health
files, editor and gitignore settings, and Dependabot — applied once and kept in sync as the
standard evolves.

> Status: early development. Node repositories are supported; reusable CI workflows, release
> automation, more stacks and GitHub settings are on the way. See the
> [design](docs/superpowers/specs/2026-09-25-repokit-design.md).

## Usage

```bash
npx @vannt-dev/repokit init     # detect the stack, write .repokit.yml, apply the standard
npx @vannt-dev/repokit check    # report drift; exits 1 when the repository has drifted
npx @vannt-dev/repokit update   # move to the latest standard without overwriting your edits
```

`init` never overwrites a file you already have: it reports it as unmanaged. Pass
`--adopt <path>` to let repokit manage it, or list it under `owned` in `.repokit.yml` to keep it
yours. Every write command accepts `--dry-run`.

Requires Node.js 22.12 or newer.

## License

MIT
