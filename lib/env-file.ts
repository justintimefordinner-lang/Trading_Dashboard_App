// Minimal .env reader/writer for one purpose: letting the Settings page edit
// specific keys in databridge/.env without disturbing anything else in that
// file — comments, blank lines, key order, and any keys we don't know about
// all survive a write untouched. This is NOT a general-purpose dotenv parser
// (no quoting, no multiline values, no variable expansion) — databridge/.env
// only ever contains simple KEY=value lines, so that's all this supports.
import fs from "node:fs";
import path from "node:path";

const LINE_RE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

/** Read every KEY=value pair currently in the file. Missing file -> {}. */
export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LINE_RE);
    if (m) out[m[2]] = m[4];
  }
  return out;
}

/**
 * Apply `updates` on top of the existing file, in place: a key that already
 * exists gets its value replaced on the same line; a key that doesn't exist
 * yet gets appended at the end. Every other line — comments, blank lines,
 * keys not mentioned in `updates` — passes through unchanged. Creates the
 * file (and its parent folder) if it doesn't exist yet, which covers first-
 * time setup as well as editing an already-configured .env.
 */
export function writeEnvUpdates(filePath: string, updates: Record<string, string>): void {
  const existed = fs.existsSync(filePath);
  const lines = existed ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];

  const remaining = new Set(Object.keys(updates));
  const next = lines.map((line) => {
    const m = line.match(LINE_RE);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[2])) {
      remaining.delete(m[2]);
      return `${m[1]}${m[2]}${m[3]}${updates[m[2]]}`;
    }
    return line;
  });

  // Drop trailing blank lines before appending so we don't accumulate gaps
  // across repeated saves, then append anything that wasn't already present.
  while (next.length && next[next.length - 1] === "") next.pop();
  for (const key of remaining) {
    next.push(`${key}=${updates[key]}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next.join("\n") + "\n");
  // Credentials live in this file — keep it owner-read/write-only regardless
  // of the umask that created it.
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort; not fatal if the filesystem doesn't support it
  }
}
