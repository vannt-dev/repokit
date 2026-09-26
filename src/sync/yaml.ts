import { Document, isMap, isScalar, parseDocument } from "yaml";
import { UsageError } from "../errors.js";
import { getAtPath } from "./json.js";

export interface YamlWriteOptions {
  /** Comment placed at the top of a file repokeeper creates. */
  header: string;
  /** Preferred order of top-level keys; keys not listed keep their relative order after them. */
  order?: readonly string[];
}

function parse(text: string, file: string): Document {
  const doc = parseDocument(text);
  const error = doc.errors[0];
  if (error) throw new UsageError(`${file} is not valid YAML: ${error.message.split("\n")[0]}`);
  return doc;
}

function render(doc: Document, original: string | null): string {
  const text = doc.toString({ lineWidth: 0, nullStr: "", flowCollectionPadding: false });
  return original?.includes("\r\n") ? text.replace(/\r?\n/g, "\r\n") : text;
}

/** JSON text of the value at `keyPath`, or null when the key is absent. */
export function readYamlKey(text: string, keyPath: string[], file: string): string | null {
  const value = getAtPath(parse(text, file).toJS() ?? {}, keyPath);
  return value === undefined ? null : JSON.stringify(value);
}

export function setYamlKey(
  text: string | null,
  file: string,
  keyPath: string[],
  value: unknown,
  options: YamlWriteOptions,
): string {
  const fresh = text === null || text.trim() === "";
  const doc = text !== null && !fresh ? parse(text, file) : new Document({});
  if (fresh) doc.commentBefore = ` ${options.header}`;
  doc.setIn(keyPath, doc.createNode(value));
  const order = options.order;
  if (order && isMap(doc.contents)) {
    const rank = (key: unknown) => {
      const index = order.indexOf(String(isScalar(key) ? key.value : key));
      return index === -1 ? order.length : index;
    };
    doc.contents.items.sort((a, b) => rank(a.key) - rank(b.key));
  }
  return render(doc, text);
}

/** Removes the key and any parents it leaves empty; null when nothing is left. */
export function deleteYamlKey(text: string, file: string, keyPath: string[]): string | null {
  const doc = parse(text, file);
  doc.deleteIn(keyPath);
  for (let depth = keyPath.length - 1; depth > 0; depth--) {
    const parent = doc.getIn(keyPath.slice(0, depth));
    if (!isMap(parent) || parent.items.length > 0) break;
    doc.deleteIn(keyPath.slice(0, depth));
  }
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return null;
  return render(doc, text);
}
