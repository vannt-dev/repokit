type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function getAtPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function setAtPath(obj: JsonObject, path: string[], value: unknown): void {
  let current = obj;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isObject(next)) current[key] = {};
    current = current[key] as JsonObject;
  }
  current[path[path.length - 1] as string] = value;
}

export function deleteAtPath(obj: JsonObject, path: string[]): void {
  const parent = getAtPath(obj, path.slice(0, -1));
  if (isObject(parent)) delete parent[path[path.length - 1] as string];
}

/** Serialises with the original file's indentation, line ending and final newline. */
export function formatJson(value: unknown, original: string | null): string {
  const indent = original ? (/^([ \t]+)"/m.exec(original)?.[1] ?? 2) : 2;
  const eol = original?.includes("\r\n") ? "\r\n" : "\n";
  return JSON.stringify(value, null, indent).replace(/\n/g, eol) + eol;
}
