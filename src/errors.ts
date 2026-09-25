export class RepokitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** `.repokit.yml` is missing or invalid. */
export class ConfigError extends RepokitError {
  constructor(message: string) {
    super(message, 2);
  }
}

/** The command cannot run as requested. */
export class UsageError extends RepokitError {
  constructor(message: string) {
    super(message, 2);
  }
}

/** `.repokit/lock.json` is unreadable; the repository state is unknown, which counts as drift. */
export class LockError extends RepokitError {
  constructor(message: string) {
    super(message, 1);
  }
}
