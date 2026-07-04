// Server-side read of the "Example mode" toggle. The Example button sets a
// cookie client-side and calls router.refresh(); server components read it here
// and swap in the example dataset (lib/example.ts) so the whole app — server and
// client rendered — shows demo values consistently.
import { cookies } from "next/headers";

export const EXAMPLE_COOKIE = "exampleMode";

export async function isExampleMode(): Promise<boolean> {
  try {
    return (await cookies()).get(EXAMPLE_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}
