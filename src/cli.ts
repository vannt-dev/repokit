#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { RepokitError, UsageError } from "./errors.js";
import { PACKAGE_VERSION } from "./version.js";

export interface Io {
  cwd: string;
  out(line: string): void;
  err(line: string): void;
}

export const USAGE = [
  "usage: repokit <command> [options]",
  "",
  "commands:",
  "  init    detect stacks, write .repokit.yml and apply the standard",
  "  check   report drift from the standard without writing (exit 1 on drift)",
  "  update  move to the standard of this repokit version and resync",
  "",
  "options:",
  "  --dry-run        show what would change without writing",
  "  --force          write even when target files have uncommitted changes",
  "  --adopt <path>   let repokit manage an existing file (repeatable); --adopt-all for every file",
  "  --accept <path>  take repokit's version of a locally edited file (update, repeatable)",
  "  --stack <id>     stack to use instead of detection (init, repeatable)",
  "  --relock         rebuild .repokit/lock.json from the current files (init)",
  "  --json           machine-readable output (check)",
  "  -v, --version    print the version",
].join("\n");

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        adopt: { type: "string", multiple: true, default: [] },
        "adopt-all": { type: "boolean", default: false },
        accept: { type: "string", multiple: true, default: [] },
        stack: { type: "string", multiple: true, default: [] },
        relock: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }).valueOf() as { values: Record<string, unknown>; positionals: string[] };
    if (values.version) {
      io.out(PACKAGE_VERSION);
      return 0;
    }
    const [command] = positionals;
    if (values.help || command === undefined) {
      io.out(USAGE);
      return command === undefined && !values.help ? 2 : 0;
    }
    throw new UsageError(`unknown command: ${command}`);
  } catch (error) {
    if (error instanceof RepokitError) {
      io.err(`repokit: ${error.message}`);
      if (error instanceof UsageError) io.err(USAGE);
      return error.exitCode;
    }
    if (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS")) {
      io.err(`repokit: ${error.message}`);
      io.err(USAGE);
      return 2;
    }
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && realpathSync(invokedPath) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2), {
    cwd: process.cwd(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  }).then((code) => {
    process.exitCode = code;
  });
}
