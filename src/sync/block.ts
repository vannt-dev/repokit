import { normalizeEol } from "./hash.js";

export type CommentStyle = "hash" | "html";

function comment(style: CommentStyle, text: string): string {
  return style === "hash" ? `# ${text}` : `<!-- ${text} -->`;
}

export function startMarker(id: string, style: CommentStyle): string {
  return comment(style, `repokeeper:start ${id}`);
}

export function endMarker(id: string, style: CommentStyle): string {
  return comment(style, `repokeeper:end ${id}`);
}

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function locate(lines: string[], id: string, style: CommentStyle): [number, number] | null {
  const start = lines.indexOf(startMarker(id, style));
  if (start < 0) return null;
  const end = lines.indexOf(endMarker(id, style), start + 1);
  return end < 0 ? null : [start, end];
}

export function readBlock(text: string, id: string, style: CommentStyle): string | null {
  const lines = normalizeEol(text).split("\n");
  const range = locate(lines, id, style);
  return range ? lines.slice(range[0] + 1, range[1]).join("\n") : null;
}

export function upsertBlock(text: string | null, id: string, body: string, style: CommentStyle): string {
  const eol = text === null ? "\n" : eolOf(text);
  const blockLines = [startMarker(id, style), ...normalizeEol(body).split("\n"), endMarker(id, style)];
  if (text === null || text.trim() === "") return blockLines.join(eol) + eol;
  const lines = text.split(eol);
  const range = locate(lines, id, style);
  if (range) {
    lines.splice(range[0], range[1] - range[0] + 1, ...blockLines);
    return lines.join(eol);
  }
  const base = text.endsWith(eol) ? text : text + eol;
  return base + eol + blockLines.join(eol) + eol;
}

export function removeBlock(text: string, id: string, style: CommentStyle): string {
  const eol = eolOf(text);
  const lines = text.split(eol);
  const range = locate(lines, id, style);
  if (!range) return text;
  let [start] = range;
  if (start > 0 && lines[start - 1] === "") start -= 1;
  lines.splice(start, range[1] - start + 1);
  return lines.join(eol);
}
