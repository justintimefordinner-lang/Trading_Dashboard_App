// Backs the Settings page's refresh-interval controls: reads/writes the
// *_PUSH_INTERVAL keys in schwab-bridge/.env, which is where auto_push.py
// reads them from (hot-reloaded every ~5s once the bridge reload patch is in,
// so a change here takes effect without restarting anything).
import { BRIDGE_ENV_PATH } from "@/lib/bridge-dir";
import { readEnvFile, writeEnvUpdates } from "@/lib/env-file";

export const dynamic = "force-dynamic";

const DEFAULT_MINUTES = {
  app: 1, // 60s
  sheets: 5, // 300s
  history: 1, // 60s
  research: 15, // 900s
  amReport: 30, // 1800s
  amLadder: 5, // 300s
};

function secToMin(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n / 60 : fallback;
}

export async function GET() {
  const env = readEnvFile(BRIDGE_ENV_PATH);
  return Response.json({
    intervals: {
      appMinutes: secToMin(env.APP_PUSH_INTERVAL, DEFAULT_MINUTES.app),
      sheetsMinutes: secToMin(env.SHEETS_PUSH_INTERVAL, DEFAULT_MINUTES.sheets),
      historyMinutes: secToMin(env.HISTORY_PUSH_INTERVAL, DEFAULT_MINUTES.history),
      researchMinutes: secToMin(env.RESEARCH_PUSH_INTERVAL, DEFAULT_MINUTES.research),
      amReportMinutes: secToMin(env.AM_REPORT_PUSH_INTERVAL, DEFAULT_MINUTES.amReport),
      amLadderMinutes: secToMin(env.AM_LADDER_PUSH_INTERVAL, DEFAULT_MINUTES.amLadder),
    },
  });
}

interface SettingsBody {
  appMinutes?: number;
  sheetsMinutes?: number;
  historyMinutes?: number;
  researchMinutes?: number;
  amReportMinutes?: number;
  amLadderMinutes?: number;
}

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export async function POST(req: Request) {
  let body: SettingsBody;
  try {
    body = (await req.json()) as SettingsBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  const intervalFields: Array<[keyof SettingsBody, string]> = [
    ["appMinutes", "APP_PUSH_INTERVAL"],
    ["sheetsMinutes", "SHEETS_PUSH_INTERVAL"],
    ["historyMinutes", "HISTORY_PUSH_INTERVAL"],
    ["researchMinutes", "RESEARCH_PUSH_INTERVAL"],
    ["amReportMinutes", "AM_REPORT_PUSH_INTERVAL"],
    ["amLadderMinutes", "AM_LADDER_PUSH_INTERVAL"],
  ];
  for (const [field, envKey] of intervalFields) {
    const val = body[field];
    if (val === undefined) continue;
    if (!isFiniteNonNegative(val)) {
      return Response.json({ ok: false, error: `${field} must be a number >= 0 (minutes).` }, { status: 400 });
    }
    updates[envKey] = String(Math.round(val * 60));
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  writeEnvUpdates(BRIDGE_ENV_PATH, updates);

  return Response.json({ ok: true });
}
