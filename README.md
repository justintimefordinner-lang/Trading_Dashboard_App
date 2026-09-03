# Trading Dashboard

A self-hosted **Next.js dashboard** for tracking a stock & options portfolio — holdings,
open option positions (cash-secured puts, covered calls, LEAPs, spreads), closed-trade
history, P&L, research signals, and market context (VIX, breadth). **Read-only:** it
displays data, it never places trades.

The app reads its data from local JSON files in `data/`, which are written by a companion
data bridge. Out of the box — with no data and no bridge — it runs in **example mode** on a
built-in demo dataset, so you can explore the whole UI immediately.

> **Step-by-step walkthrough** (from a blank Raspberry Pi SD card to live data):
> [Portfolio Manager setup guide](https://claude.ai/code/artifact/9eea9386-6f02-41fb-ba82-629ee9c95ad7).
> This README is the condensed version.

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

## How it fits together

Two small programs and a folder. The Python **bridge** logs into Schwab on a timer and
writes plain JSON into `data/`. This **dashboard** reads those files and draws the screens.
That folder is the only link between them — no network connection, no trade-execution
code anywhere.

```
  BRIDGE (Python)  ── writes ──►  data/  ◄── reads ──  DASHBOARD (Next.js, port 3000)
  reads Schwab on a timer         snapshot.json,       what you open in a browser
                                  schwab-auth.json …
```

Docker runs each half in its own container and mounts the same `data/` folder into both.
The dashboard is **write-only** toward the bridge: from Settings it deposits your App
Key/Secret (`credentials.env`, mode 600) and the pasted login URL into the bridge folder,
and never reads the bridge's secrets back.

## Quick start with Docker (recommended)

Docker brings its own Node and Python, so nothing else needs installing. It runs on a
**Raspberry Pi 4** (recommended: about three watts, silent, comes back by itself after a
power cut), a Windows PC, or a Mac. On a PC or Mac the dashboard is live only while that
machine is awake.

**Before you start:** a Schwab brokerage account and a registered Schwab developer app.
Approval takes a few days, so start that today — see the
[bridge README](https://github.com/justintimefordinner-lang/Schwab_Bridge_Public#1-register-a-schwab-developer-app-do-this-first--approval-takes-a-few-days).

### 1. Install Docker

- **Raspberry Pi:** `curl -fsSL https://get.docker.com | sh`, then
  `sudo usermod -aG docker $USER`, then **log out and back in**. Docker starts on boot.
- **Windows / Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/),
  turn on *Start Docker Desktop when you sign in*, and set the machine to never sleep.

Confirm with `docker run --rm hello-world`.

### 2. Get the code — two folders, side by side

```bash
mkdir -p ~/portfolio && cd ~/portfolio
git clone https://github.com/justintimefordinner-lang/Schwab_Bridge_Public.git schwab-bridge
git clone https://github.com/justintimefordinner-lang/Trading_Dashboard_App.git
```

The `schwab-bridge` at the end of the first line renames the folder as it downloads;
compose looks for the bridge under that exact name next door (override with `BRIDGE_DIR`,
below). Keeping the bridge *outside* this folder means this repo's Git history can never
see your credentials, even by accident.

### 3. Start it

```bash
cd ~/portfolio/Trading_Dashboard_App
cp .env.docker.example .env   # settings only — no secrets in it
id -u; id -g                  # if these aren't 1000, put them in .env as UID= and GID=
docker compose up -d --build
```

The first run builds both images: a few minutes on a Pi, under a minute on a PC.
`docker compose ps` should show both services running; `docker compose logs -f` follows
the logs (Ctrl-C to stop watching).

### 4. Open it and connect Schwab

Open <http://localhost:3000> — or `http://<host-ip>:3000` from another device. Every
screen is already populated with the example dataset; that is your confirmation the
dashboard is healthy.

Then **Settings → Schwab connection**:

1. Paste your **App Key** and **App Secret**. Leave Callback URL at its default.
2. Click **Save & start login** and open the link it produces.
3. Log in with your *brokerage* credentials and approve the accounts to share.
4. Your browser will fail to load `https://127.0.0.1:8182/?code=…`. **That is expected** —
   nothing listens there. Copy that whole URL out of the address bar.
5. Paste it into the box on Settings and click **Finish sign-in**.

The card reads "Connected to Schwab" and real numbers replace the example data within a
minute or two. The login and paste can happen from any device, including your phone —
nothing has to run on the host, which is what makes a screenless Pi work.

### Settings in `.env`

All optional; the defaults suit a stock Raspberry Pi OS install. The file holds no secrets.

| Setting | Purpose |
|---|---|
| `TZ` | Your timezone, so market-hours logic and timestamps are right. |
| `UID` / `GID` | Both containers run as this user, so everything they write into `data/` and the bridge folder stays yours to edit. |
| `DASHBOARD_PORT` | Publish on another host port if 3000 is already taken. |
| `BRIDGE_DIR` | Where the bridge checkout lives, if it isn't `../schwab-bridge`. |
| `COMPOSE_FILE=docker-compose.yml:docker-compose.acct2.yml` | Run a second Schwab login from a second bridge clone — see the header of `docker-compose.acct2.yml`. |

## Day to day

- **Nothing to babysit.** Both containers are `restart: unless-stopped`, so they come back
  after a reboot or a power cut on their own.
- **Reconnect weekly — make it a Sunday habit.** Schwab stops refreshing the login token
  after roughly seven days; the Settings card then says "Not connected — reconnect to resume
  live data." Click **Reconnect Schwab** and repeat the link-and-paste. Doing it every Sunday
  means it never expires during market hours.
- **Pull updates** (both halves together):
  ```bash
  cd ~/portfolio/schwab-bridge && git pull
  cd ../Trading_Dashboard_App && git pull
  docker compose up -d --build
  ```
  The dashboard rebuilds its image (the old container keeps serving until the new one is
  ready). The bridge's code is bind-mounted, so it only needs a restart unless
  `requirements.txt` changed.
- **Quiet overnight is normal.** Schwab doesn't serve option chains outside market hours;
  the bridge keeps the last good board rather than churning.
- **From your phone:** put the host and your phone on a [Tailscale](https://tailscale.com)
  network and open `http://100.x.y.z:3000`. Nothing is published to the open internet.

## Troubleshooting

| Symptom | What's happening |
|---|---|
| Still showing example data | The bridge hasn't written a snapshot yet. Check Settings says "Connected to Schwab", then `docker compose logs bridge`. |
| "Not connected — reconnect to resume live data." | The ~7-day token expired. **Reconnect Schwab** in Settings. |
| Browser can't reach `127.0.0.1:8182` | Expected, every time. Copy the URL from the address bar and paste it into Settings. |
| Port 3000 already in use | Set `DASHBOARD_PORT=3001` in `.env`, then `docker compose up -d`. |
| Bridge restarts in a loop before setup | Normal until Settings has been saved once: it exits with "Set APP_DATA_DIR" until the app writes the bridge's `.env`. |
| Build killed partway through on a Pi | Out of memory. Add swap and build again. |
| Files owned by root, can't edit them | Your user isn't 1000. Put `id -u` / `id -g` in `.env` and `docker compose up -d --force-recreate`. |
| Board empty overnight or at weekends | Expected — Schwab doesn't serve option chains then. |

## Running without Docker (development)

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

Run the bridge bare-metal per its README with `APP_DATA_DIR` pointed at this project's
`data/` folder, and keep both running under a process manager (`systemd`, `pm2`).

## Data: example vs. live

The app loads a portfolio snapshot in this order:

1. **Example mode** (a UI toggle) → the built-in demo dataset in `lib/example.ts`
2. Otherwise → `data/snapshot.json` (and the other `data/*.json` files)
3. If those are missing/unreadable → it falls back to the example dataset

Everything in `data/` is **gitignored** and **`.dockerignore`d** — real portfolio data never
gets committed or baked into an image. The data is written by:

> **Data bridge:** [`Schwab_Bridge_Public`](https://github.com/justintimefordinner-lang/Schwab_Bridge_Public)
> — a small read-only Python bridge that pulls from a Charles Schwab account and writes the
> `data/*.json` this app reads.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, `output: "standalone"`) · React 19 · TypeScript
- Tailwind CSS v4
- File-based data (no database) — the `data/*.json` snapshot is the single source of truth
- `Dockerfile` (multi-stage, ~470 MB image on arm64) + `docker-compose.yml` for the two-container stack

## Notes

- This is a personal-use dashboard, not investment advice. Data can be delayed or
  incomplete; verify anything before acting on it.
- No secrets or credentials live in this repo — the app only ever *reads* local JSON. All
  brokerage access is isolated in the separate bridge project.
- **Commit-time secret guard:** a dependency-free `.githooks/pre-commit` (plus a gitleaks
  `.pre-commit-config.yaml`) blocks accidental commits of credential files or secret-looking
  values. After cloning, enable it with `git config core.hooksPath .githooks`.
