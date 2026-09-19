"use client";

// Settings → Manual positions. Track holdings Schwab can't see (another broker,
// a 401k window, a paper account): pick or create a manual account, add rows one
// at a time, or import a spreadsheet. The bridge prices every row from Schwab
// market data each cycle, so a manual CSP gets the same mark, Greeks, and
// Hold / Rollable / At-risk read as a Schwab-held one.
//
// The importer (dialog below) opens with the columns it needs, detects them
// from the file's headers and values, and — when something it needs is
// missing but the file has unused columns — asks whether one of those is it,
// before showing a preview of what will be imported.
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ManualAccount, ManualPosition } from "@/lib/manual-positions";
import {
  FIELD_HELP,
  FIELD_LABEL,
  REQUIRED_OPTION,
  REQUIRED_STOCK,
  TEMPLATE_CSV,
  convertRows,
  detectMapping,
  findHeaderRow,
  normHeader,
  parseCsv,
  type Field,
  type ImportOptions,
  type ImportResult,
  type Mapping,
} from "@/lib/csv-import";

const inputClass = "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted/60 outline-none ring-emerald-400/40 focus:ring-2";
const labelClass = "mb-1 block text-xs font-medium text-muted";
const btnPrimary = "rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-50";
const btnQuiet = "rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border hover:text-text disabled:opacity-50";
const money = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; account?: ManualAccount; added?: number; skipped?: string[] }> {
  const res = await fetch("/api/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

function describe(p: ManualPosition): string {
  if (p.type === "stock") return `${p.qty} sh @ ${money(p.avgCost)}`;
  return `${p.side === "short" ? "sold" : "bought"} ${p.qty} × $${p.strike} ${p.optionType} · exp ${p.expiration} · ${money(p.premium)}/sh`;
}

export function ManualPositions({ initial }: { initial: ManualAccount[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ManualAccount[]>(initial);
  const [selected, setSelected] = useState<string>(initial[0]?.id ?? "new");
  const [newLabel, setNewLabel] = useState("");
  const [newCash, setNewCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const account = accounts.find((a) => a.id === selected) ?? null;

  const sync = (acct: ManualAccount) => {
    setAccounts((list) => (list.some((a) => a.id === acct.id) ? list.map((a) => (a.id === acct.id ? acct : a)) : [...list, acct]));
    setSelected(acct.id);
    router.refresh();
  };

  async function createAccount(thenImport = false) {
    setBusy(true);
    setErr("");
    const r = await post({ action: "account", label: newLabel, cash: Number(newCash || 0) });
    setBusy(false);
    if (!r.ok || !r.account) return setErr(r.error ?? "Could not create the account.");
    setNewLabel("");
    setNewCash("");
    sync(r.account);
    setMsg(`Added ${r.account.label}.${thenImport ? "" : " Now add positions or import a spreadsheet."}`);
    if (thenImport) setShowImport(true);
  }

  async function saveCash(cash: number) {
    if (!account) return;
    const r = await post({ action: "account", id: account.id, label: account.label, cash });
    if (r.ok && r.account) sync(r.account);
  }

  async function removeAccount() {
    if (!account) return;
    if (!window.confirm(`Remove ${account.label} and its ${account.positions.length} positions?`)) return;
    setBusy(true);
    const r = await post({ action: "delete-account", id: account.id });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Could not remove.");
    setAccounts((list) => list.filter((a) => a.id !== account.id));
    setSelected(accounts.find((a) => a.id !== account.id)?.id ?? "new");
    router.refresh();
  }

  async function removePosition(id: string) {
    if (!account) return;
    const r = await post({ action: "delete", accountId: account.id, id });
    if (r.ok) sync({ ...account, positions: account.positions.filter((p) => p.id !== id) });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Positions held somewhere Schwab can&apos;t see. Enter only what a broker can&apos;t look up — size, strike, expiry,
        what you paid — and the bridge prices them from Schwab market data every cycle. They show up as their own
        account everywhere positions do.
      </p>

      {/* Account picker — only once there is something to pick between. With no
          accounts yet the only entry would be "New…", a dropdown that goes nowhere. */}
      {accounts.length > 0 ? (
        <div>
          <label className={labelClass} htmlFor="manual-account">Account</label>
          <select id="manual-account" value={selected} onChange={(e) => setSelected(e.target.value)} className={inputClass}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.positions.length} {a.positions.length === 1 ? "position" : "positions"}
              </option>
            ))}
            <option value="new">＋ New manual account…</option>
          </select>
        </div>
      ) : (
        <div className={labelClass}>New manual account</div>
      )}

      {selected === "new" && (
        <div className="space-y-2">
          <input id="manual-new-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Name, e.g. Fidelity CSV or E*TRADE" className={inputClass} />
          <input id="manual-new-cash" value={newCash} onChange={(e) => setNewCash(e.target.value)} placeholder="Cash in that account (optional)" inputMode="decimal" className={inputClass} />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => createAccount(true)} disabled={busy || !newLabel.trim()} className={btnPrimary}>Create and import a spreadsheet</button>
            <button onClick={() => createAccount(false)} disabled={busy || !newLabel.trim()} className={btnQuiet}>Create, add positions by hand</button>
          </div>
          <p className="text-[11px] text-muted">
            {newLabel.trim() ? "The positions you add or import go into this account." : "Type a name to enable the buttons — the positions you add or import go into that account."}
          </p>
        </div>
      )}

      {account && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowAdd((v) => !v)} className={btnPrimary}>{showAdd ? "Close form" : "Add a position"}</button>
            <button onClick={() => setShowImport(true)} className={btnPrimary}>Import a spreadsheet</button>
            <CashField value={account.cash} onSave={saveCash} />
            <button onClick={removeAccount} disabled={busy} className={`${btnQuiet} ml-auto`}>Remove account</button>
          </div>

          {showAdd && <AddForm accountId={account.id} onAdded={(a) => { sync(a); setMsg("Added. Priced on the bridge's next cycle."); }} />}

          {account.positions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">No positions yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {account.positions.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold">{p.symbol}</span>{" "}
                    <span className={`rounded px-1 py-0.5 text-[9.5px] font-semibold ${p.type === "stock" ? "bg-cyan-500/15 text-cyan-300" : p.optionType === "put" ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300"}`}>
                      {p.type === "stock" ? "STOCK" : p.optionType.toUpperCase()}
                    </span>
                    <div className="truncate text-muted">{describe(p)}</div>
                  </div>
                  <button onClick={() => removePosition(p.id)} aria-label={`Remove ${p.symbol}`} className="shrink-0 text-muted hover:text-rose-400">✕</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {err && <p className="text-xs text-rose-400">{err}</p>}
      {msg && !err && <p className="text-xs text-emerald-400">{msg}</p>}

      {showImport && account && (
        <ImportDialog
          account={account}
          onClose={() => setShowImport(false)}
          onImported={(a, n) => {
            sync(a);
            setShowImport(false);
            setMsg(`Imported ${n} ${n === 1 ? "position" : "positions"} into ${a.label}.`);
          }}
        />
      )}
    </div>
  );
}

function CashField({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className={btnQuiet} title="Free cash in this account, beyond what secures its sold puts. The total counts that collateral separately.">
        Free cash {money(value)}
      </button>
    );
  return (
    <span className="flex items-center gap-1">
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" className={`${inputClass} w-28 py-1`} aria-label="Cash" />
      <button onClick={() => { const n = Number(v); if (Number.isFinite(n) && n >= 0) onSave(n); setEditing(false); }} className={btnQuiet}>Save</button>
    </span>
  );
}

// ---- single-row form ---------------------------------------------------------
// All strings, so one setter covers every field; the API validates on submit.
const blank = { type: "option", symbol: "", qty: "", avgCost: "", optionType: "put", side: "short", strike: "", expiration: "", premium: "", openedAt: "" };

function AddForm({ accountId, onAdded }: { accountId: string; onAdded: (a: ManualAccount) => void }) {
  const [f, setF] = useState({ ...blank });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof blank, v: string) => setF((s) => ({ ...s, [k]: v }));
  const isOpt = f.type === "option";

  async function submit() {
    setBusy(true);
    setErr("");
    const row = isOpt
      ? { type: "option", symbol: f.symbol, qty: Number(f.qty), optionType: f.optionType, side: f.side, strike: Number(f.strike), expiration: f.expiration, premium: Number(f.premium), openedAt: f.openedAt || undefined }
      : { type: "stock", symbol: f.symbol, qty: Number(f.qty), avgCost: Number(f.avgCost), openedAt: f.openedAt || undefined };
    const r = await post({ action: "add", accountId, rows: [row] });
    setBusy(false);
    if (!r.ok || !r.account) return setErr(r.error ?? "Could not add.");
    setF({ ...blank, type: f.type });
    onAdded(r.account);
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-[11px] font-medium">
        {(["option", "stock"] as const).map((t) => (
          <button key={t} onClick={() => set("type", t)} className={`flex-1 rounded-md px-2 py-1 ${f.type === t ? "bg-surface text-text shadow-sm" : "text-muted"}`}>
            {t === "option" ? "Option" : "Stock"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelClass} htmlFor="mp-symbol">Symbol</label><input id="mp-symbol" value={f.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="SOFI" className={inputClass} /></div>
        <div><label className={labelClass} htmlFor="mp-qty">{isOpt ? "Contracts" : "Shares"}</label><input id="mp-qty" value={f.qty} onChange={(e) => set("qty", e.target.value)} inputMode="decimal" className={inputClass} /></div>
        {isOpt ? (
          <>
            <div>
              <label className={labelClass} htmlFor="mp-otype">Put or call</label>
              <select id="mp-otype" value={f.optionType} onChange={(e) => set("optionType", e.target.value)} className={inputClass}><option value="put">Put</option><option value="call">Call</option></select>
            </div>
            <div>
              <label className={labelClass} htmlFor="mp-side">Side</label>
              <select id="mp-side" value={f.side} onChange={(e) => set("side", e.target.value)} className={inputClass}><option value="short">Sold (short)</option><option value="long">Bought (long)</option></select>
            </div>
            <div><label className={labelClass} htmlFor="mp-strike">Strike</label><input id="mp-strike" value={f.strike} onChange={(e) => set("strike", e.target.value)} inputMode="decimal" className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="mp-exp">Expiration</label><input id="mp-exp" type="date" value={f.expiration} onChange={(e) => set("expiration", e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="mp-prem">Premium per share</label><input id="mp-prem" value={f.premium} onChange={(e) => set("premium", e.target.value)} inputMode="decimal" placeholder="0.69" className={inputClass} /></div>
          </>
        ) : (
          <div><label className={labelClass} htmlFor="mp-cost">Average cost per share</label><input id="mp-cost" value={f.avgCost} onChange={(e) => set("avgCost", e.target.value)} inputMode="decimal" className={inputClass} /></div>
        )}
        <div><label className={labelClass} htmlFor="mp-opened">Opened (optional)</label><input id="mp-opened" type="date" value={f.openedAt} onChange={(e) => set("openedAt", e.target.value)} className={inputClass} /></div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Add"}</button>
        {err && <span className="text-xs text-rose-400">{err}</span>}
      </div>
    </div>
  );
}

// ---- import dialog -----------------------------------------------------------
type Step = "intro" | "map" | "preview";

function ImportDialog({ account, onClose, onImported }: { account: ManualAccount; onClose: () => void; onImported: (a: ManualAccount, n: number) => void }) {
  const [step, setStep] = useState<Step>("intro");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping>({});
  const [firstLine, setFirstLine] = useState(2);
  const [opts, setOpts] = useState<ImportOptions>({ defaultOptionSide: "short" });
  const [replace, setReplace] = useState(false);
  const [useCash, setUseCash] = useState(true);
  // Whether the file's cash row includes the cash securing the sold puts (a
  // cash-secured account's balance does) or is free cash only. null = decide
  // from the numbers: if the row covers the collateral, assume it includes it.
  const [cashIncludes, setCashIncludes] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const result: ImportResult | null = useMemo(() => (rows.length ? convertRows(rows, map, opts, firstLine) : null), [rows, map, opts, firstLine]);
  const good = result?.rows.filter((r) => r.position) ?? [];
  const bad = result?.rows.filter((r) => r.error) ?? [];
  // Cash securing the sold puts in this file. The account is valued the way the
  // rest of the app values it — a CSP counts as its collateral — so the cash we
  // store is FREE cash, beyond that collateral.
  const shortPutCollateral = good.reduce((s, r) => {
    const p = r.position!;
    return p.type === "option" && p.optionType === "put" && p.side === "short" ? s + (p.strike ?? 0) * 100 * p.qty : s;
  }, 0);
  const cashCoversCollateral = result?.cash != null && shortPutCollateral > 0 && result.cash >= shortPutCollateral;
  const includes = cashIncludes ?? cashCoversCollateral;
  const freeCash = result?.cash == null ? null : includes ? Math.max(0, result.cash - shortPutCollateral) : result.cash;
  const unused = headers.map((h, i) => ({ h, i })).filter(({ h, i }) => h.trim() && !Object.values(map).includes(i));
  // Only ask about fields that would actually rescue a row, and only when
  // there is an unused column that could be the answer.
  const askFor = (result?.missing ?? []).filter((f) => map[f] == null);

  async function onFile(file: File) {
    setErr("");
    const text = await file.text();
    const all = parseCsv(text);
    if (all.length < 2) return setErr("That file has no rows under its header.");
    const hi = findHeaderRow(all);
    const hdr = all[hi].map((h) => h.trim());
    // Data rows: everything after the header that has at least two filled cells
    // (footers and disclaimers are one long cell on their own line), minus any
    // repeat of the header row — Schwab's all-accounts export restates it per
    // account section.
    const hdrKey = hdr.map(normHeader).join("|");
    const data = all
      .slice(hi + 1)
      .filter((r) => r.filter((c) => c.trim() !== "").length >= 2)
      .filter((r) => r.map((c) => normHeader(c.trim())).join("|") !== hdrKey);
    setFileName(file.name);
    setHeaders(hdr);
    setRows(data);
    setFirstLine(hi + 2);
    setMap(detectMapping(hdr, data.slice(0, 50)));
    setStep("map");
  }

  async function doImport() {
    setBusy(true);
    setErr("");
    const r = await post({
      action: "import",
      accountId: account.id,
      replace,
      rows: good.map((g) => g.position),
      cash: useCash && freeCash != null ? freeCash : undefined,
    });
    setBusy(false);
    if (!r.ok || !r.account) return setErr(r.error ?? "Import failed.");
    onImported(r.account, r.added ?? good.length);
  }

  const mappingRows: Field[] = ["symbol", "description", "quantity", "entry", "costTotal", "optionType", "side", "strike", "expiration", "openedAt"];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface-2 p-5 ring-1 ring-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="import-title" className="text-sm font-semibold">Import positions into {account.label}</h3>
            <p className="mt-0.5 text-[11px] text-muted">
              {step === "intro" ? "What the spreadsheet needs" : step === "map" ? `Reading ${fileName}` : `Ready to import from ${fileName}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-text">✕</button>
        </div>

        {step === "intro" && (
          <div className="mt-4 space-y-3 text-xs">
            <p className="text-muted">
              Export your positions from the broker as CSV, or save your own sheet as CSV. Column names don&apos;t have to
              match ours — the importer recognises the usual variations and reads a full option symbol
              (<span className="font-mono text-text">SOFI 261009P00016000</span>, <span className="font-mono text-text">-SOFI261009P16</span>,
              or <span className="font-mono text-text">SOFI Oct 09 2026 $16 Put</span>) for strike, expiry and put/call.
            </p>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">For stocks</div>
              <ul className="space-y-0.5">
                {REQUIRED_STOCK.map((f) => (
                  <li key={f}><span className="font-medium text-text">{FIELD_LABEL[f]}</span> <span className="text-muted">— {FIELD_HELP[f]}</span></li>
                ))}
              </ul>
              <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">For options, also</div>
              <ul className="space-y-0.5">
                {REQUIRED_OPTION.filter((f) => !REQUIRED_STOCK.includes(f)).map((f) => (
                  <li key={f}><span className="font-medium text-text">{FIELD_LABEL[f]}</span> <span className="text-muted">— {FIELD_HELP[f]}</span></li>
                ))}
              </ul>
              <p className="mt-2 text-muted">
                Optional: <span className="text-text">{FIELD_LABEL.openedAt}</span> for days in trade, and{" "}
                <span className="text-text">{FIELD_LABEL.costTotal}</span> if the file has a total instead of a per-share price.
                A negative quantity, or a Side column, marks a sold option. A cash row (Schwab&apos;s &ldquo;Cash &amp; Cash
                Investments&rdquo;, Fidelity&apos;s core position) sets the account&apos;s free cash from its value column.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={labelClass} htmlFor="import-default-side">If the file doesn&apos;t say, options are</label>
              <select id="import-default-side" value={opts.defaultOptionSide} onChange={(e) => setOpts({ defaultOptionSide: e.target.value as "short" | "long" })} className={`${inputClass} w-auto py-1`}>
                <option value="short">sold (short)</option>
                <option value="long">bought (long)</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input ref={fileRef} id="import-file" type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <button onClick={() => fileRef.current?.click()} className={btnPrimary}>Choose a CSV file</button>
              <button
                onClick={() => {
                  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "manual-positions-template.csv";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                className={btnQuiet}
              >
                Download a template
              </button>
            </div>
          </div>
        )}

        {step === "map" && result && (
          <div className="mt-4 space-y-3 text-xs">
            <p className="text-muted">
              {headers.length} columns, {rows.length} rows. Found {good.length} {good.length === 1 ? "position" : "positions"}
              {bad.length > 0 ? `, ${bad.length} ${bad.length === 1 ? "row" : "rows"} still need something` : ""}.
            </p>

            {askFor.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="mb-2 font-medium text-amber-200">
                  {askFor.length === 1 ? "One thing wasn't found on its own." : `${askFor.length} things weren't found on their own.`}
                  {unused.length > 0 ? " Is one of the unused columns it?" : " The file doesn't seem to have a column for it."}
                </div>
                <div className="space-y-2">
                  {askFor.map((f) => (
                    <div key={f} className="flex flex-wrap items-center gap-2">
                      <label className="min-w-32 font-medium text-text" htmlFor={`ask-${f}`}>{FIELD_LABEL[f]}</label>
                      <select id={`ask-${f}`} value="" onChange={(e) => { const v = e.target.value; if (v !== "") setMap((m) => ({ ...m, [f]: Number(v) })); }} className={`${inputClass} w-auto py-1`}>
                        <option value="">{unused.length ? "Not in this file" : "No unused columns"}</option>
                        {unused.map(({ h, i }) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                      <span className="text-muted">{FIELD_HELP[f]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details className="rounded-xl border border-border bg-surface p-3">
              <summary className="cursor-pointer font-medium">How the columns were read</summary>
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {mappingRows.map((f) => (
                  <div key={f} className="contents">
                    <label className="text-muted" htmlFor={`map-${f}`}>{FIELD_LABEL[f]}</label>
                    <select id={`map-${f}`} value={map[f] ?? ""} onChange={(e) => { const v = e.target.value; setMap((m) => { const next = { ...m }; if (v === "") delete next[f]; else next[f] = Number(v); return next; }); }} className={`${inputClass} py-0.5 text-[11px]`}>
                      <option value="">—</option>
                      {headers.map((h, i) => (h.trim() ? <option key={i} value={i}>{h}</option> : null))}
                    </select>
                  </div>
                ))}
              </div>
            </details>

            {bad.length > 0 && (
              <details className="rounded-xl border border-border bg-surface p-3">
                <summary className="cursor-pointer font-medium">Rows that will be skipped ({bad.length})</summary>
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-muted">
                  {bad.slice(0, 60).map((r) => (
                    <li key={r.line}>Line {r.line}: {r.error}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => setStep("preview")} disabled={good.length === 0} className={btnPrimary}>Preview {good.length} {good.length === 1 ? "position" : "positions"}</button>
              <button onClick={() => { setStep("intro"); setRows([]); }} className={btnQuiet}>Pick another file</button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="mt-4 space-y-3 text-xs">
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {good.map((r) => {
                const p = r.position!;
                return (
                  <li key={r.line} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span><span className="font-semibold">{p.symbol}</span> <span className="text-muted">{p.type === "stock" ? "stock" : `${p.optionType}`}</span></span>
                    <span className="tabular text-muted">
                      {p.type === "stock"
                        ? `${p.qty} sh @ ${money(p.avgCost ?? 0)}`
                        : `${p.side === "short" ? "sold" : "bought"} ${p.qty} × $${p.strike} · ${p.expiration} · ${money(p.premium ?? 0)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {result?.cash != null && freeCash != null && (
              <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <div>
                  The file&apos;s cash row reads <span className="font-semibold text-text">{money(result.cash)}</span>.
                  {shortPutCollateral > 0 && (
                    <>
                      {" "}Its sold puts tie up <span className="font-semibold text-text">{money(shortPutCollateral)}</span> of collateral, which
                      the account total already counts.
                    </>
                  )}
                </div>
                {shortPutCollateral > 0 && (
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text">That cash figure</span>
                    <select
                      id="import-cash-mode"
                      value={includes ? "includes" : "free"}
                      onChange={(e) => setCashIncludes(e.target.value === "includes")}
                      className={`${inputClass} w-auto py-1`}
                    >
                      <option value="includes">includes the cash securing the puts (exclude collateralized cash)</option>
                      <option value="free">is free cash only</option>
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={useCash} onChange={(e) => setUseCash(e.target.checked)} />
                  <span>
                    Set {account.label}&apos;s free cash to <span className="font-semibold text-text">{money(freeCash)}</span>
                  </span>
                </label>
              </div>
            )}
            {result?.cash == null && (
              <p className="text-muted">
                No cash row in this file, so free cash stays at {money(account.cash)}. The total still counts the collateral behind
                any sold puts; use the Cash button to add cash beyond that.
              </p>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>Replace the {account.positions.length} positions already in {account.label} (a fresh export), rather than adding to them</span>
            </label>
            {err && <p className="text-rose-400">{err}</p>}
            <div className="flex items-center gap-2">
              <button onClick={doImport} disabled={busy} className={btnPrimary}>{busy ? "Importing…" : `Import ${good.length}`}</button>
              <button onClick={() => setStep("map")} className={btnQuiet}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
