import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Stamps the current pathname onto a request header so the root layout
// (a Server Component, no useRouter/usePathname available) can tell
// whether to render the mobile phone-frame chrome or the wide-surface
// shell — /desktop and /overview skip the phone frame entirely. Everything
// else about the request passes through unchanged.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}
