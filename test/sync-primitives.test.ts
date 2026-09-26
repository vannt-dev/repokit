import { describe, expect, it } from "vitest";
import { readBlock, removeBlock, upsertBlock } from "../src/sync/block.js";
import { hashText } from "../src/sync/hash.js";
import { deleteAtPath, formatJson, getAtPath, setAtPath } from "../src/sync/json.js";

describe("hashText", () => {
  it("ignores CRLF versus LF", () => {
    expect(hashText("a\r\nb\r\n")).toBe(hashText("a\nb\n"));
  });
});

describe("blocks", () => {
  const start = "# repokeeper:start gitignore";
  const end = "# repokeeper:end gitignore";

  it("creates a file holding only the block", () => {
    expect(upsertBlock(null, "gitignore", "dist/", "hash")).toBe(`${start}\ndist/\n${end}\n`);
  });

  it("appends after a blank line when the file lacks a trailing newline", () => {
    expect(upsertBlock("node_modules/", "gitignore", "dist/", "hash")).toBe(
      `node_modules/\n\n${start}\ndist/\n${end}\n`,
    );
  });

  it("replaces only the block body and keeps CRLF and surrounding content", () => {
    const text = `keep-before\r\n\r\n${start}\r\nold\r\n${end}\r\nkeep-after\r\n`;
    expect(upsertBlock(text, "gitignore", "new-1\nnew-2", "hash")).toBe(
      `keep-before\r\n\r\n${start}\r\nnew-1\r\nnew-2\r\n${end}\r\nkeep-after\r\n`,
    );
  });

  it("reads the body back as LF text", () => {
    expect(readBlock(`x\r\n${start}\r\na\r\nb\r\n${end}\r\n`, "gitignore", "hash")).toBe("a\nb");
    expect(readBlock("no block here\n", "gitignore", "hash")).toBeNull();
  });

  it("uses HTML comments for markdown", () => {
    expect(upsertBlock(null, "x", "body", "html")).toBe(
      "<!-- repokeeper:start x -->\nbody\n<!-- repokeeper:end x -->\n",
    );
  });

  it("removes the block and the blank line before it", () => {
    const text = `node_modules/\n\n${start}\ndist/\n${end}\n`;
    expect(removeBlock(text, "gitignore", "hash")).toBe("node_modules/\n");
  });
});

describe("json", () => {
  it("gets, sets and deletes nested keys", () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    setAtPath(obj, ["devDependencies", "lefthook"], "^2.1.14");
    expect(getAtPath(obj, ["devDependencies", "lefthook"])).toBe("^2.1.14");
    expect(getAtPath(obj, ["missing", "x"])).toBeUndefined();
    deleteAtPath(obj, ["a", "b"]);
    expect(obj).toEqual({ a: {}, devDependencies: { lefthook: "^2.1.14" } });
  });

  it("keeps four-space indentation and a final newline", () => {
    const original = '{\n    "name": "x"\n}\n';
    expect(formatJson({ name: "x", v: 1 }, original)).toBe('{\n    "name": "x",\n    "v": 1\n}\n');
  });

  it("keeps tab indentation and CRLF endings", () => {
    const original = '{\r\n\t"name": "x"\r\n}\r\n';
    expect(formatJson({ name: "x" }, original)).toBe('{\r\n\t"name": "x"\r\n}\r\n');
  });

  it("uses two spaces for a new file", () => {
    expect(formatJson({ a: 1 }, null)).toBe('{\n  "a": 1\n}\n');
  });
});
