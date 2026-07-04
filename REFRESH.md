# Refreshing portfolio data (Claude Code runbook)

The web app **cannot** call the Robinhood MCP connector — only Claude Code can.
The app's refresh button just **queues a request**; Claude Code fulfills it.

## The loop

1. User taps **Refresh** in the app (or you're asked to "refresh the portfolio").
2. The app writes `data/refresh-request.json` → `{ "requestedAt": "<ISO>" }`.
   The button then shows "Awaiting Claude…" and polls `/api/status`.
3. **You (Claude Code)** pull fresh data via the MCP and overwrite
   `data/snapshot.json` with a newer `meta.generatedAt`.
4. The app detects the newer `generatedAt`, calls `router.refresh()`, and the UI
   updates. Done.

A refresh is considered **pending** while `refresh-request.json.requestedAt` is
newer than `snapshot.json.meta.generatedAt`.

## How to fulfill (do this when a request is pending or the user asks)

**Always re-discover positions first — never refresh from a hardcoded list of
known instrument ids.** Every refresh (manual taps included, not just the hourly
loop) must call `get_equity_positions` and `get_option_positions` (nonzero) up
front to learn the *current* holdings, then diff that set against the positions
already in `data/snapshot.json`. A freshly opened position (e.g. a put sold an
hour ago) or a closed one will only appear if you discover it here — re-quoting
the prior snapshot's ids silently misses anything new. **Report the diff to the
user by default** ("found a new GLW $160p", "CCJ $107p is no longer open"), even
when they didn't ask what changed.

Use the Robinhood MCP connector (tools prefixed `mcp__…__`). Call:

- `get_accounts` → account numbers (use the default/individual account)
- `get_portfolio` → `summary` (totalValue, equityValue, optionsValue, cryptoValue, cash, buyingPower)
- `get_equity_positions` → symbols, qty, avg cost (**source of truth for which equities are held**)
- `get_equity_quotes` → latest price per symbol (batch ≤ 20 for closes)
- `get_option_positions` (nonzero) → contracts, qty, average_price, expiration (**source of truth for which options are open** — discover ids here, do not assume)
- `get_option_instruments` (by the ids from get_option_positions) → strike + call/put type
- `get_option_quotes` (by those ids) → mark, delta, theta, iv, breakeven, chance_of_profit_short

Pull this for **each** account from `get_accounts` (the app shows an account
switcher). Then map into the `Snapshot` shape (see `lib/types.ts`) and **write
`data/snapshot.json`**. Note the shape: `{ meta, accounts: [...], data: { "<accountId>": { summary, equities, options, valueHistory } } }` — `data` is
keyed by `account.id`, one entry per account.

- `entryPerShare` = option `average_price` ÷ 100
- `mark` = option `mark_price`
- option `kind`: long-dated long call → `leap-call`; long-dated long put → `leap-put-hedge`; short put → `csp`
- set `meta.generatedAt` = current ISO time, `meta.source` = `"robinhood-mcp"`,
  `meta.pricesAsOf` = a human label (e.g. "2026-06-13 close")

**Closed-CSP sync (important).** A refresh that only rewrites the snapshot will
make a closed CSP *disappear from Open* but it will **not** show up in the
**Closed** tab — that tab reads a separate file (`data/csp-closed.json`). So when
you refresh, compare the open CSP ids before vs after: **if any CSP that was open
is no longer open** (bought-to-close, expired, or assigned), also rebuild
`data/csp-closed.json` per "Regenerating closed-CSP history" below. Only then does
the closed round-trip appear in the app. (The hourly auto-refresh loop does this
automatically.)

Finally **delete `data/refresh-request.json`** to clear the pending flag.

> Read-only: never place trades or move money. This flow only reads positions.

## Regenerating CSP candidates

The CSP tab's "Sell a new CSP — screened" section reads `data/csp-candidates.json`
(loader `lib/csp-candidates.ts`; scoring `lib/csp-model.ts`). To refresh it:

1. Pick the universe. Two sources:
   - **Holdings** (wheel approach): the user's large-cap stocks.
   - **Discovery**: run `node scripts/csp-discover.mjs [TICKER ...]` (no args → built-in
     S&P shortlist). It pulls Yahoo daily candles and computes the starter signals
     (RSI(14), SMA50/200, 20-day support) — the same method as `Repos/stock-starter-signals-v2`
     — and returns names in an uptrend pullback (above 200-DMA, RSI 30–55, near 50-DMA).
     Take the `qualified` list. (The signals project's API needs login; this script avoids
     that by reading Yahoo directly — chart data needs no auth.)
2. Choose an expiration 30–45 DTE (a monthly 3rd-Friday).
3. For each symbol: `get_option_instruments(chain_symbol, expiration_dates, type=put)`,
   pick several strikes ~5–15% OTM, `get_option_quotes` them, and keep every strike whose
   delta falls in ~0.15–0.33 (the screener shows multiple strikes per ticker across the
   0.20–0.30 band; one CSPCandidate row per strike). Strike spacing limits some names to
   1–2 in-band strikes — that's expected.
4. **Technicals (canonical source = the connector):** pull `get_equity_historicals`
   (interval=day, start ≥ ~70 trading days back) for the chosen symbols. If the result is
   large it's saved to a tool-results file — transform it to `data/_hist.json` as
   `[{symbol, strike, closes, lows}]`, then run `node scripts/compute-technicals.mjs data/_hist.json`.
   It prints `technical` (aboveSma50/rsi/strikeBelowSupport) per symbol via `lib/indicators.mjs`.
   (The Yahoo `csp-discover.mjs` scan in step 1 is only for finding names; the app's stored
   technicals come from the connector so everything is one source. Delete `_hist.json` after.)
5. Write each as a `CSPCandidate` (see `lib/types.ts`): store mark/bid/ask/delta(magnitude)/
   theta/iv/OI/volume/chanceOfProfitShort/dte, fundamentals booleans for known large-caps,
   `source` ("holding" | "discovered"), and the computed `technical`.
   Leave `ivRank` and `flags.*` as `null` (no feed). Update `meta.generatedAt`/`pricesAsOf`.
6. The score is computed at render time — no need to precompute it.

Read-only — never place the order. Technicals now come from the connector; to also
unlock IV-Rank and the earnings filter, wire a historical-IV / earnings-calendar feed.

## Regenerating closed-CSP history

The CSP tab's **Closed** sub-tab reads `data/csp-closed.json` (loader `lib/csp-closed.ts`).
To rebuild: pull `get_option_orders(account_number, state="filled")` (saved to a tool-results
file if large), then reconstruct short-put round-trips: group filled orders by put `option_id`,
sum sell/open credits vs buy/close debits; a position is closed when close qty ≥ open qty
(realized = credit − debit) or when the expiration has passed with no close (expired worthless,
realized = full credit). Skip puts whose expiration is still in the future (those are open).
Write each as a `ClosedCSP` (see `lib/types.ts`). "Expired" assumes OTM worthless — verify
assignments. Read-only.

The CSP area is three tabs (`components/CspTabs.tsx`): **Open** (`CspPositions`),
**Find New** (`CspScreener`), **Closed** (`CspClosed`).

## Regenerating closed-LEAP history

The LEAPS tab's **Closed** sub-tab reads `data/leaps-closed.json` (loader `lib/leaps-closed.ts`).
Same idea as closed CSPs but for **long** options: pull `get_option_orders(account_number,
state="filled")`, group by `option_id`, and reconstruct long-call / long-put-hedge round-trips —
sum buy/open debits (cost basis) vs sell/close credits (proceeds); a position is closed when
close qty ≥ open qty (`realizedPnl = proceeds − costBasis`), or expired worthless if the
expiration passed with no close (`proceeds = 0`). Only count long-dated positions (LEAPs); skip
ones still open. Write each as a `ClosedLeap` (see `lib/types.ts`), newest-first, and refresh
`meta.generatedAt`.

The LEAPS area mirrors CSPs — three tabs (`components/LeapTabs.tsx`): **Open**, **Find New**
(curated ideas), **Closed** (`LeapClosed`). Like the CSP closed-sync, when a refresh sees a LEAP
leave the open set (sold-to-close, expired, assigned), rebuild this file so it lands in Closed.

## Hands-off option (auto-poll)

To make a phone tap update the app within seconds without re-asking, run a
watcher in a Claude Code session:

```
/loop 15s check data/refresh-request.json in the portfolio-app; if a refresh is
pending, pull fresh data via the Robinhood MCP, rewrite data/snapshot.json per
REFRESH.md, and delete the request file
```

Stop the loop when you're done.

## Refreshing the VIX posture

The **VIX** tab reads `data/vix.json` (loader `lib/vix-data.ts`; engine `lib/vix.ts`).
The engine is pure and computes regime/reserve/action from the inputs at render time —
to refresh, you only update the inputs. Procedure (read-only):

1. **VIX spot:** `get_indexes(symbols="VIX")` → take the `id`, then
   `get_index_quotes(instrument_ids=[id])` → `value`.
2. **Realized vol (for the VRP gate):** `get_equity_historicals(symbols=["SPY"],
   interval="day", start_time= ~45 days back)`. Take `close_price` per bar, compute daily
   log returns, then `realized_vol = sqrt(252) * stdev(returns[-N:]) * 100` for **N=20 and
   N=30** (store both; the engine uses 20d as primary).
3. **Stress complex (VIX9D / VIX3M / VVIX / SKEW):** the Robinhood connector does **not**
   expose these (only VIX + SPX are available as indexes). Leave them `null`. Per the
   context doc §5.7 the engine then runs in reduced-confidence mode (level + VRP only) and
   never assumes calm. If you later wire a Cboe/Polygon/FRED feed, fill these in and the
   engine automatically adds term-structure/VVIX modifiers and the hook gate.
4. Write `data/vix.json`: `{ asof, source, note, inputs: { vix, vix9d, vix3m, vvix, skew,
   realizedVol20, realizedVol30, realizedVolBasis } }`. Set `asof` to the VIX quote time.

Signals are most reliable on the **daily close** (intraday VIX is noisy) — refresh once
after close for the next session's posture. Never recommend selling into a rising
backwardation spike; that rule lives in the engine but only fires when VIX3M is present.
