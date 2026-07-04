import { redirect } from "next/navigation";

// The CSP page has been folded into the unified Options page. Keep the route as
// a redirect so old links/bookmarks (and Action Center alerts) still work.
export default function CspPage() {
  redirect("/options");
}
