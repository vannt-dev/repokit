import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LockError } from "../src/errors.js";
import type { Output } from "../src/model.js";
import { decide, decideRemoval } from "../src/sync/decide.js";
import { hashText } from "../src/sync/hash.js";
import { LOCK_FILE, type LockEntry, readLock, targetOf, writeLock } from "../src/sync/lock.js";
import { desiredText, readCurrent } from "../src/sync/state.js";
import { tempDir } from "./helpers.js";

const file: Output = { kind: "file", module: "m", path: "a.txt", content: "new\n" };
const entry = (text: string): LockEntry => ({
  id: "file:a.txt",
  module: "m",
  hash: hashText(text),
  target: targetOf(file),
});

describe("decide", () => {
  it("creates what is missing", () => expect(decide(file, null, undefined, false)).toBe("create"));
  it("leaves matching content alone", () => expect(decide(file, "new\n", entry("old\n"), false)).toBe("unchanged"));
  it("treats a CRLF checkout of the same content as unchanged", () =>
    expect(decide(file, "new\r\n", entry("new\n"), false)).toBe("unchanged"));
  it("writes over content repokit wrote earlier", () =>
    expect(decide(file, "old\n", entry("old\n"), false)).toBe("write"));
  it("flags content the user edited", () => expect(decide(file, "mine\n", entry("old\n"), false)).toBe("conflict"));
  it("does not take over an existing file", () => expect(decide(file, "mine\n", undefined, false)).toBe("unmanaged"));
  it("takes over an existing file when adopted", () => expect(decide(file, "mine\n", undefined, true)).toBe("adopt"));
});

describe("decideRemoval", () => {
  it("deletes untouched output", () => expect(decideRemoval(entry("old\n"), "old\n")).toBe("delete"));
  it("keeps edited output", () => expect(decideRemoval(entry("old\n"), "mine\n")).toBe("orphan-edited"));
  it("notes output that is already gone", () => expect(decideRemoval(entry("old\n"), null)).toBe("gone"));
});

describe("state", () => {
  it("reads files, blocks and JSON keys as comparable text", async () => {
    const root = await tempDir();
    await writeFile(join(root, "a.txt"), "hello\n");
    await writeFile(join(root, ".gitignore"), "x\n\n# repokit:start g\ndist/\n# repokit:end g\n");
    await writeFile(join(root, "package.json"), '{ "devDependencies": { "lefthook": "^2.1.14" } }');
    expect(await readCurrent(root, { kind: "file", path: "a.txt" })).toBe("hello\n");
    expect(await readCurrent(root, { kind: "file", path: "missing.txt" })).toBeNull();
    expect(await readCurrent(root, { kind: "block", path: ".gitignore", id: "g", comment: "hash" })).toBe("dist/");
    expect(
      await readCurrent(root, { kind: "json", path: "package.json", keyPath: ["devDependencies", "lefthook"] }),
    ).toBe('"^2.1.14"');
    expect(await readCurrent(root, { kind: "json", path: "package.json", keyPath: ["scripts", "x"] })).toBeNull();
    expect(desiredText({ kind: "json", module: "m", path: "package.json", keyPath: ["a"], value: "^1" })).toBe('"^1"');
  });
});

describe("lock", () => {
  it("round-trips and reports a missing lock as null", async () => {
    const root = await tempDir();
    expect(await readLock(root)).toBeNull();
    const lock = { lockVersion: 1 as const, standard: "1.0.0", entries: [entry("x")] };
    await writeLock(root, lock);
    expect(await readLock(root)).toEqual(lock);
  });

  it("rejects a corrupt lock with a hint", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".repokit"));
    await writeFile(join(root, LOCK_FILE), "{ nope");
    await expect(readLock(root)).rejects.toThrow(LockError);
    await expect(readLock(root)).rejects.toThrow("repokit init --relock");
  });
});
