// Server-side loader for the research feed (data/research.json, written by the
// Python research_sync). Import only from server components. Returns null when the
// file is absent so the page can show a "run the sync" hint instead of crashing.
import fs from "node:fs";
import path from "node:path";
import type { ResearchFile } from "./research-types";

export const RESEARCH_PATH = path.join(process.cwd(), "data", "research.json");

export function getResearch(): ResearchFile | null {
  try {
    const raw = fs.readFileSync(RESEARCH_PATH, "utf8");
    const parsed = JSON.parse(raw) as ResearchFile;
    if (parsed?.tickers) return parsed;
  } catch {
    // missing or malformed — caller falls back to the plain approved list
  }
  return null;
}
