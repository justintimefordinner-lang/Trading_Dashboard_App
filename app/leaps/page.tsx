import { redirect } from "next/navigation";

// The LEAPS page has been folded into the unified Options page. Keep the route as
// a redirect so old links/bookmarks (and Action Center alerts) still work.
export default function LeapsPage() {
  redirect("/options");
}
