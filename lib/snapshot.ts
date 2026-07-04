// Server-side loader for the live portfolio snapshot. Import only from server
// components and route handlers (it touches the filesystem).
// Reads data/snapshot.json (written locally by the Python bridge) and falls
// back to the bundled example dataset when that file is absent or unreadable.
// The real snapshot is generated on the host and never ships in the repo.
import fs from "node:fs";
import path from "node:path";
import type { Snapshot } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleSnapshot } from "./example";

export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "snapshot.json");
export const REQUEST_PATH = path.join(process.cwd(), "data", "refresh-request.json");

function readSnapshotFile(): Snapshot {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed?.data && Array.isArray(parsed.accounts)) return parsed;
  } catch {
    // file missing or malformed — fall through to the example dataset
  }
  return exampleSnapshot;
}

export async function getSnapshot(): Promise<Snapshot> {
  if (await isExampleMode()) return exampleSnapshot;
  return readSnapshotFile();
}

export interface RefreshRequest {
  requestedAt: string;
}

export function readRequest(): RefreshRequest | null {
  try {
    return JSON.parse(fs.readFileSync(REQUEST_PATH, "utf8")) as RefreshRequest;
  } catch {
    return null;
  }
}

/** A refresh is pending when a request exists that is newer than the snapshot. */
export function isPending(): boolean {
  const req = readRequest();
  if (!req) return false;
  const snap = readSnapshotFile();
  return new Date(req.requestedAt).getTime() > new Date(snap.meta.generatedAt).getTime();
}
