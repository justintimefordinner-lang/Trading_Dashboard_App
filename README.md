# Trading Dashboard

A self-hosted **Next.js dashboard** for tracking a stock & options portfolio — holdings,
open option positions (cash-secured puts, covered calls, LEAPs, spreads), closed-trade
history, P&L, research signals, and market context (VIX, breadth). **Read-only:** it
displays data, it never places trades.

The app reads its data from local JSON files in `data/`, which are written by a companion
data bridge. Out of the box — with no data and no bridge — it runs in **example mode** on a
built-in demo dataset, so you can explore the whole UI immediately.

## Features

- **Overview** — total value, buying power, day change, and a value-history chart
- **Holdings** — equities and crypto with cost basis and live-ish marks
- **Options** — positions grouped by strategy (CSP, covered call, LEAP, spread), with
  Greeks, breakevens, and chance-of-profit
- **Closed trades** — realized round-trips per strategy bucket
- **Research & screeners** — approved-stock research signals and a CSP candidate screener
- **Market context** — VIX regime guide and morning briefing
- **Example mode** — a full, self-consistent demo dataset so the app is presentable
  without exposing (or even having) real data

## Getting started

### Prerequisites
- **Node.js 20+** and npm

### Install & run
```bash
npm install
npm run dev      # dev server at http://localhost:3000
```
The dev server binds `0.0.0.0`, so you can also reach it from other devices on your
network at `http://<your-machine-ip>:3000`.

For a production build:
```bash
npm run build
npm run start    # serves the optimized build on port 3000
```

With no `data/` files present, every view renders the **example dataset** — nothing to
configure to look around.

## Data: example vs. live

The app loads a portfolio snapshot in this order:

1. **Example mode** (a UI toggle) → the built-in demo dataset in `lib/example.ts`
2. Otherwise → `data/snapshot.json` (and the other `data/*.json` files)
3. If those are missing/unreadable → it falls back to the example dataset

Everything in `data/*.json` is **gitignored** — real portfolio data never gets committed.
To feed the dashboard live data, run the companion bridge, which writes those JSON files:

> **Data bridge:** [`Schwab_Bridge_Public`](https://github.com/justintimefordinner-lang/Schwab_Bridge_Public)
> — a small read-only Python bridge that pulls from a Charles Schwab account and writes the
> `data/*.json` this app reads. Point its `APP_DATA_DIR` at this project's `data/` folder.

## Deployment (optional)

It runs anywhere Node runs, including a Raspberry Pi. A simple pattern is to run
`npm run start` under a process manager (e.g. a `systemd` service) so it auto-starts on
boot, with the bridge running alongside it writing fresh data on an interval.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- File-based data (no database) — the `data/*.json` snapshot is the single source of truth

## Notes

- This is a personal-use dashboard, not investment advice. Data can be delayed or
  incomplete; verify anything before acting on it.
- No secrets or credentials live in this repo — the app only ever *reads* local JSON. All
  brokerage access is isolated in the separate bridge project.
