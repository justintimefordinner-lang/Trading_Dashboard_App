// Example-mode earnings dates ({ SYMBOL: "YYYY-MM-DD" }, like fetch_earnings.py's
// data/earnings.json). Used to flag CSPs that span an earnings report. These are
// the real upcoming report dates kept in lib/example-market.ts; the example CSP
// options carry the same dates, so the -ER flag fires exactly where it would live.
import { EXAMPLE_EARNINGS } from "./example-market";

export const exampleEarnings: Record<string, string> = EXAMPLE_EARNINGS;
