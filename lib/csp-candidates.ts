// Server-side loader for screened CSP candidates (data/csp-candidates.json),
// written by the data bridge.
import fs from "node:fs";
import path from "node:path";
import type { CSPCandidatesFile } from "./types";

export const CSP_CANDIDATES_PATH = path.join(process.cwd(), "data", "csp-candidates.json");

const EMPTY: CSPCandidatesFile = {
  meta: { generatedAt: "", pricesAsOf: "", dteBasis: "", universe: "" },
  candidates: [],
};

export function getCspCandidates(): CSPCandidatesFile {
  try {
    const raw = fs.readFileSync(CSP_CANDIDATES_PATH, "utf8");
    const parsed = JSON.parse(raw) as CSPCandidatesFile;
    if (parsed?.candidates && Array.isArray(parsed.candidates)) return parsed;
  } catch {
    // file missing or malformed — return empty
  }
  return EMPTY;
}
