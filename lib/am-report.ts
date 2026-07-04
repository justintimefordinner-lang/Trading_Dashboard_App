// Server-side loader for the AM report (data/am_report.json, written by the Python
// am_report engine). Import only from server components. Returns null when the file
// is absent so the page can show a "run am_report.py" hint instead of crashing.
import fs from "node:fs";
import path from "node:path";
import type { AmReport } from "./am-report-types";

export const AM_REPORT_PATH = path.join(process.cwd(), "data", "am_report.json");

export function getAmReport(): AmReport | null {
  try {
    const raw = fs.readFileSync(AM_REPORT_PATH, "utf8");
    const parsed = JSON.parse(raw) as AmReport;
    if (Array.isArray(parsed?.board)) return parsed;
  } catch {
    // missing or malformed
  }
  return null;
}
