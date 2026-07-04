<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Portfolio data refresh

This app's data is a file-based snapshot at `data/snapshot.json`, read by
`lib/snapshot.ts` (falls back to the seed in `lib/data.ts`). The browser app
cannot reach the Robinhood MCP connector — **Claude Code is the bridge**.

When the user asks to refresh, or `data/refresh-request.json` exists with a
`requestedAt` newer than the snapshot's `meta.generatedAt`: pull fresh data via
the Robinhood MCP connector, rewrite `data/snapshot.json`, then delete the
request file. Full procedure: see `REFRESH.md`. Read-only — never trade.
