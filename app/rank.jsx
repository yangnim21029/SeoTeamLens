"use client";
import React, { useMemo, useState, useEffect, useDeferredValue, memo, useRef, useCallback, useTransition } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis, XAxis, ReferenceArea, ReferenceLine, CartesianGrid } from "recharts";
import { Search, Link as LinkIcon, Copy, ListTree, ChevronDown, ChevronRight, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// --- Utilities ---------------------------------------------------------------
// Deterministic PRNG to avoid SSR/CSR hydration mismatches
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clampRank = (r) => (r == null ? null : Math.min(r, 100));
const fmtRank = (r) => (r == null || r > 100 ? "N/A" : `#${r}`);
const safeRank = (v) => (v == null || v > 100 ? 101 : v);
const trendDelta = (start, end) => {
  const s = safeRank(start);
  const e = safeRank(end);
  return s - e; // positive => improved (smaller rank)
};
function isDropFromTopN(start, end, n) {
  const s = safeRank(start);
  const e = safeRank(end);
  return s <= n && e > n;
}

function genHistory(days = 90, base = 60, rng) {
  const rnd = rng || Math.random;
  const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
  let r = Math.max(5, base + randInt(-5, 5));
  const arr = [];
  for (let i = 0; i < days; i++) {
    const drift = randInt(-3, 3);
    r = Math.max(1, r + drift);
    if (rnd() < 0.06) r += randInt(-12, 12);
    const dropped = rnd() < 0.04;
    arr.push(dropped ? 101 : Math.min(120, Math.max(1, r)));
  }
  return arr;
}

// Build deterministic demo dataset using a fixed seed
const _seed = seedFromString("ranklens-demo-seed");
const _rng = mulberry32(_seed);
const initialRows = [
  { keyword: "nmn 補充品", displayUrl: "https://example.com/nmn", history: genHistory(120, 18, _rng) },
  { keyword: "nmn 功效", displayUrl: "https://example.com/nmn", history: genHistory(120, 21, _rng) },
  { keyword: "nmn 價格", displayUrl: "https://example.com/nmn", history: genHistory(120, 39, _rng) },
  { keyword: "香港 車中泊", displayUrl: "https://example.com/camping", history: genHistory(120, 26, _rng) },
  { keyword: "車中泊 裝備", displayUrl: "https://example.com/camping", history: genHistory(120, 34, _rng) },
  { keyword: "彩虹邨 打卡", displayUrl: "https://example.com/choihung", history: genHistory(120, 5, _rng) },
  { keyword: "昂坪360 開放時間", displayUrl: "https://example.com/ngong-ping-360", history: genHistory(120, 14, _rng) },
  { keyword: "昂坪360 門票", displayUrl: "https://example.com/ngong-ping-360", history: genHistory(120, 19, _rng) },
  { keyword: "西貢 橋咀島 獨木舟", displayUrl: "https://example.com/kohto-kayak", history: genHistory(120, 31, _rng) },
  { keyword: "橋咀島 直立板", displayUrl: "https://example.com/kohto-kayak", history: genHistory(120, 28, _rng) },
  { keyword: "瓦萊黑鼻羊", displayUrl: "https://example.com/valais-blacknose", history: genHistory(120, 37, _rng) },
  { keyword: "國際狗狗日", displayUrl: "https://example.com/international-dog-day", history: genHistory(120, 22, _rng) },
  { keyword: "深水埗 生機素食", displayUrl: "https://example.com/raw-vegan-ssb", history: genHistory(120, 44, _rng) },
  { keyword: "龍脊 行山", displayUrl: "https://example.com/dragons-back", history: genHistory(120, 11, _rng) },
  { keyword: "香港 親子 室內 好去處", displayUrl: "https://example.com/indoorkids", history: genHistory(120, 9, _rng) },
];

// --- Sparkline component -----------------------------------------------------
const Sparkline = memo(function Sparkline({ data }) {
  const len = data.length;
  const now = new Date();
  const baseUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const anchorUTC = baseUTC - 24 * 60 * 60 * 1000; // yesterday
  const series = useMemo(() => data.map((v, i) => {
    const val = v == null || v > 100 ? 100 : v;
    const d = new Date(anchorUTC);
    d.setUTCDate(d.getUTCDate() - (len - 1 - i));
    const label = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
    return { v: val, date: label };
  }), [data, anchorUTC, len]);

  return (
    <div className="h-16 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={[1, 100]} reversed />
          <XAxis dataKey="date" hide />
          {/* Emphasized bands */}
          <ReferenceArea y1={1} y2={10.001} fill="#94a3b8" fillOpacity={0.28} />
          <ReferenceArea y1={10.001} y2={30.001} fill="#cbd5e1" fillOpacity={0.22} />
          <ReferenceLine y={10} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.8} ifOverflow="extendDomain" />
          <ReferenceLine y={30} stroke="#94a3b8" strokeDasharray="4 4" strokeOpacity={0.7} ifOverflow="extendDomain" />
          <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" opacity={0.2} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const { value, payload: row } = payload[0];
              return (
                <div className="rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow">
                  <div>{row.date}</div>
                  <div>Rank: {value}</div>
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="v" dot={false} strokeWidth={2} isAnimationActive={false} stroke="#0f172a" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

// --- Dedupe & Merge helpers --------------------------------------------------
function mergeHistory(a = [], b = []) {
  const len = Math.max(a.length, b.length);
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    const va = ai == null ? 120 : ai;
    const vb = bi == null ? 120 : bi;
    const best = Math.min(va, vb);
    out[i] = (ai == null && bi == null) ? null : best;
  }
  return out;
}

function dedupeRows(rows) {
  const map = new Map();
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
  rows.forEach((r) => {
    const key = `${norm(r.keyword)}__${norm(r.displayUrl)}`;
    if (!map.has(key)) {
      map.set(key, { ...r });
    } else {
      const cur = map.get(key);
      // Merge histories by per-day best
      cur.history = mergeHistory(cur.history, r.history);
      // Prefer a cleaner display keyword (shorter label, i.e., fewer spaces)
      if (String(r.keyword || "").length < String(cur.keyword || "").length) {
        cur.keyword = r.keyword;
      }
      map.set(key, cur);
    }
  });
  return Array.from(map.values());
}

// --- Aggregation helpers for URL view ---------------------------------------
function aggregateByUrl(rows, windowDays) {
  const map = new Map();
  rows.forEach((r) => {
    const windowHist = r.history.slice(-windowDays).map((v) => (v == null ? null : Math.min(v, 120)));
    const start = windowHist[0];
    const end = windowHist[windowHist.length - 1];
    const delta = trendDelta(start, end);
    const item = { ...r, windowHist, start, end, delta };
    if (!map.has(r.displayUrl)) map.set(r.displayUrl, []);
    map.get(r.displayUrl).push(item);
  });

  const urlRows = Array.from(map.entries()).map(([url, items]) => {
    const days = items[0].windowHist.length;
    const agg = Array.from({ length: days }, (_, i) => {
      let best = 120;
      let seen = false;
      items.forEach((it) => {
        const v = it.windowHist[i];
        if (v == null) return;
        seen = true;
        best = Math.min(best, v);
      });
      return seen ? best : null;
    });

    const bestCurrent = Math.min(...items.map((it) => safeRank(it.end)));
    const avgCurrentRaw = items.reduce((acc, it) => acc + safeRank(it.end), 0) / items.length;
    const avgCurrent = Math.round(avgCurrentRaw);
    const improved = items.filter((it) => it.delta > 0).length;
    const declined = items.filter((it) => it.delta < 0).length;
    const inTop10 = items.filter((it) => it.end != null && it.end <= 10).length;

    return {
      displayUrl: url,
      items,
      aggSpark: agg,
      bestCurrent: bestCurrent > 100 ? null : bestCurrent,
      avgCurrent: avgCurrent > 100 ? null : avgCurrent,
      improved,
      declined,
      total: items.length,
      inTop10,
    };
  });

  return urlRows;
}

// --- URL display helpers ----------------------------------------------------
function safeDecodeURL(u) {
  if (!u || typeof u !== 'string') return u;
  try { return decodeURI(u); } catch {}
  try { return decodeURIComponent(u); } catch {}
  return u;
}

// --- Logging helpers (localStorage) ----------------------------------------
const LOG_PREFIX = "krd:log:"; // key = krd:log:<url>::<keyword>
function logKey(url, keyword) {
  return `${LOG_PREFIX}${(url || '').toLowerCase()}::${(keyword || '').toLowerCase()}`;
}
function readLogs(url, keyword) {
  try {
    const raw = localStorage.getItem(logKey(url, keyword));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeLogs(url, keyword, logs) {
  try {
    localStorage.setItem(logKey(url, keyword), JSON.stringify(logs));
  } catch {}
}
function addLog(url, keyword, note, now = Date.now()) {
  const trimmed = String(note || "").trim();
  if (!trimmed) return readLogs(url, keyword);
  const logs = readLogs(url, keyword);
  const entry = { ts: now, note: trimmed };
  const next = [entry, ...logs].slice(0, 1000);
  writeLogs(url, keyword, next);
  return next;
}
function fmtTs(ts) {
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch { return String(ts); }
}

// --- Main Component (URL-only) ----------------------------------------------
export default function KeywordRankDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [windowDays, setWindowDays] = useState(30); // 7 / 30 / 90
  const [expanded, setExpanded] = useState(new Set());
  const [forceRefresh, setForceRefresh] = useState(false);
  const [sourceMeta, setSourceMeta] = useState(null); // { csvRows, parsedKeywords, canonicalUrls }
  const isDev = process.env.NODE_ENV !== 'production';
  // Single-select filter: 'none' | 'winners' | 'decliners' | 'top10' | 'drop10' | 'drop20'
  const [activeFilter, setActiveFilter] = useState('none');
  const [isFiltering, startFiltering] = useTransition();

  // CSV + upstream defaults for HSHK
  const csvFile = "SEO Work Allocation - HSHK 總表(更新中）.csv";
  const site = "sc-domain:holidaysmart.io";
  const keywordsCol = 10; // 1-based
  const pageUrlCol = 15;  // 1-based

  // Build keyword rows from upstream results
  function buildRowsFromResults(results, days, requestedPairs = []) {
    const today = new Date();
    const baseUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const anchorUTC = baseUTC - 24 * 60 * 60 * 1000; // yesterday
    const dateIndex = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(anchorUTC);
      d.setUTCDate(d.getUTCDate() - i);
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      dateIndex.set(label, (days - 1) - i);
    }

    const map = new Map();
    // Seed with requested pairs so even if upstream lacks recent data, the keyword still appears
    for (const p of requestedPairs) {
      const page = p.page;
      const queryStr = p.query;
      if (!page || !queryStr) continue;
      const key = `${page}||${queryStr}`;
      if (!map.has(key)) {
        map.set(key, { keyword: queryStr, displayUrl: page, history: Array.from({ length: days }, () => null) });
      }
    }
    for (const row of Array.isArray(results) ? results : []) {
      const dateVal = row["CAST(date AS DATE)"] || row.date || row.dt;
      const page = row.page;
      const queryStr = row.query;
      const pos = Number.parseFloat(row.avg_position);
      if (!dateVal || !page || !queryStr || !Number.isFinite(pos)) continue;
      const d = new Date(dateVal);
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const idx = dateIndex.get(label);
      if (idx == null) continue;
      const key = `${page}||${queryStr}`;
      if (!map.has(key)) {
        map.set(key, { keyword: queryStr, displayUrl: page, history: Array.from({ length: days }, () => 120) });
      }
      const rec = map.get(key);
      const rank = Math.max(1, Math.min(120, Math.round(pos)));
      rec.history[idx] = rank;
    }
    return Array.from(map.values());
  }

  // Fetch from our CSV-driven backend
  useEffect(() => {
    let aborted = false;
    async function fetchData() {
      try {
        setLoading(true);
        setError("");
        const ts = forceRefresh ? `&_t=${Date.now()}` : '';
        const url = `/api/run-csv/hshk?file=${encodeURIComponent(csvFile)}&days=${windowDays}&site=${encodeURIComponent(site)}&keywordsCol=${keywordsCol}&pageUrlCol=${pageUrlCol}${forceRefresh ? "&refresh=1" : ""}${ts}`;
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Upstream ${res.status}: ${txt.slice(0, 200)}`);
        }
        const json = await res.json();
        if (!aborted) setSourceMeta(json?.meta || null);
        const results = Array.isArray(json?.results) ? json.results : [];
        const built = buildRowsFromResults(results, windowDays, Array.isArray(json?.requested) ? json.requested : []);
        if (!aborted) setRows(built);
      } catch (e) {
        if (!aborted) setError(e?.message || String(e));
      } finally {
        if (!aborted) {
          setLoading(false);
          if (forceRefresh) setForceRefresh(false);
        }
      }
    }
    fetchData();
    return () => { aborted = true; };
  }, [csvFile, site, keywordsCol, pageUrlCol, windowDays, forceRefresh]);

  const baseAll = useMemo(() => dedupeRows(rows), [rows]);
  const totalUrls = useMemo(() => new Set(baseAll.map((r) => r.displayUrl)).size, [baseAll]);
  const totalKeywords = baseAll.length;

  const groupedBase = useMemo(() => aggregateByUrl(baseAll, windowDays), [baseAll, windowDays]);

  const urlView = useMemo(() => {
    let grouped = groupedBase;
    const q = deferredQuery.toLowerCase();
    grouped = grouped.filter((g) => {
      const urlHit = g.displayUrl.toLowerCase().includes(q);
      const kwHit = g.items.some((it) => it.keyword.toLowerCase().includes(q));
      return urlHit || kwHit;
    });
    if (activeFilter === 'winners') {
      grouped = grouped.filter((g) => g.improved > 0);
    } else if (activeFilter === 'decliners') {
      grouped = grouped.filter((g) => g.declined > 0);
    } else if (activeFilter === 'top10') {
      grouped = grouped.filter((g) => (g.bestCurrent != null && g.bestCurrent <= 10));
    } else if (activeFilter === 'drop10') {
      grouped = grouped.filter((g) => g.items.some((it) => isDropFromTopN(it.start, it.end, 10)));
    } else if (activeFilter === 'drop20') {
      grouped = grouped.filter((g) => g.items.some((it) => isDropFromTopN(it.start, it.end, 20)));
    }
    grouped.sort((a, b) => {
      const va = a.bestCurrent ?? 999;
      const vb = b.bestCurrent ?? 999;
      return va - vb;
    });
    return grouped;
  }, [groupedBase, deferredQuery, activeFilter]);

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch (e) {}
  };

  const toggleExpand = (url) => {
    const next = new Set(Array.from(expanded));
    if (next.has(url)) next.delete(url); else next.add(url);
    setExpanded(next);
  };

  // Self-tests disabled in production for performance

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">URL Ranking · 30‑Day Tracker</h1>
          <p className="text-sm text-slate-500">快速檢查各 URL 聚合的 30 天名次變化（依最佳名次與趨勢）。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-200 shadow-sm">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                className={`px-3 py-1.5 text-sm font-medium ${windowDays === d ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                aria-pressed={windowDays === d}
              >
                {d} 天
              </button>
            ))}
          </div>
          <button
            onClick={() => setForceRefresh(true)}
            title="刷新快取"
            className="ml-1 inline-flex items-center rounded-lg border border-transparent p-1 text-slate-400 hover:text-slate-700 hover:border-slate-200 hover:bg-slate-100 transition"
            aria-label="Refresh cache"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status + URL-only label (no tabs) */}
      {(loading || error) && (
        <div className="mb-3 text-sm">
          {loading && <span className="text-slate-600">載入中…</span>}
          {error && <span className="text-rose-600">載入失敗：{error}</span>}
        </div>
      )}
      <div className="mb-3 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
        <ListTree className="h-4 w-4" /> URL 檢視（多關鍵字聚合）
      </div>

      {/* Toolbar */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={"搜尋 URL 或其關鍵字…"}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-300"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"><span className="text-slate-500">篩選</span></span>
          <ToggleButton label="上升" active={activeFilter === 'winners'} onClick={() => startFiltering(() => setActiveFilter(activeFilter === 'winners' ? 'none' : 'winners'))} />
          <ToggleButton label="下滑" active={activeFilter === 'decliners'} onClick={() => startFiltering(() => setActiveFilter(activeFilter === 'decliners' ? 'none' : 'decliners'))} />
          <ToggleButton label="Top 10" active={activeFilter === 'top10'} onClick={() => startFiltering(() => setActiveFilter(activeFilter === 'top10' ? 'none' : 'top10'))} />
          <ToggleButton label="掉出 Top 10" active={activeFilter === 'drop10'} onClick={() => startFiltering(() => setActiveFilter(activeFilter === 'drop10' ? 'none' : 'drop10'))} />
          <ToggleButton label="掉出 Top 20" active={activeFilter === 'drop20'} onClick={() => startFiltering(() => setActiveFilter(activeFilter === 'drop20' ? 'none' : 'drop20'))} />
          {isFiltering && <span className="text-xs text-slate-400">更新中…</span>}
        </div>
      </div>

      {/* URL Table */}
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <UrlTable
            view={urlView}
            expanded={expanded}
            toggleExpand={toggleExpand}
            copy={copy}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 text-xs text-slate-500 space-y-1">
        <div>* 排名數字愈小愈好；折線向上 = 排名提升。</div>
      </div>

      {/* Dev-only floating source badge */}
      {isDev && sourceMeta && (
        <div className="fixed bottom-2 right-2 z-50 rounded-lg bg-black/70 px-2 py-1 text-[11px] text-white shadow-lg backdrop-blur-sm">
          SEO 參考｜Total URLs: {totalUrls} · Total Keywords: {totalKeywords} · CSV Rows: {sourceMeta.csvRows} · Parsed KWs: {sourceMeta.parsedKeywords} · Canonical URLs: {sourceMeta.canonicalUrls}
        </div>
      )}
    </div>
  );
}

function ToggleButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  );
}

// --- URL Table ---------------------------------------------------------------
function UrlTable({ view, expanded, toggleExpand, copy }) {
  const containerRef = useRef(null);
  const ROW_HEIGHT = 64; // px, approximate fixed row height for summary row
  const THRESHOLD = 50; // item count threshold to turn on virtualization
  // Allow URL to wrap; disable virtualization to keep variable row heights correct
  const ALLOW_URL_WRAP = true;
  const useVirtual = !ALLOW_URL_WRAP && expanded.size === 0 && view.length > THRESHOLD;

  const Row = useCallback((u) => {
    const isOpen = expanded.has(u.displayUrl);
    return (
      <React.Fragment key={u.displayUrl}>
        <tr className="border-t border-slate-100 hover:bg-slate-50/60">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => toggleExpand(u.displayUrl)} className="rounded-lg border border-slate-200 p-1 hover:bg-slate-100" title="展開/收合">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <a href={u.displayUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline flex-1 min-w-0">
                <span className="inline-flex items-start gap-1 max-w-full whitespace-normal break-all">
                  <LinkIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-all">{safeDecodeURL(u.displayUrl)}</span>
                </span>
              </a>
              <button onClick={() => copy(u.displayUrl)} className="rounded-lg border border-slate-200 p-1 hover:bg-slate-100" title="Copy URL">
                <Copy className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="text-slate-800">
              {u.items.slice(0, 3).map((it, idx) => (
                <span key={it.keyword} className="inline">
                  {idx > 0 ? ', ' : ''}{it.keyword}
                </span>
              ))}
              {u.total > 3 && <span className="text-slate-500">，+{u.total - 3} 更多</span>}
              {u.total === 0 && <span className="text-slate-400">—</span>}
            </div>
          </td>
          <td className="px-4 py-3">
            <span className={`inline-flex rounded-lg px-2 py-0.5 font-medium ${u.bestCurrent && u.bestCurrent <= 10 ? "bg-emerald-50 text-emerald-700" : u.bestCurrent && u.bestCurrent <= 30 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
              {fmtRank(u.bestCurrent)}
            </span>
          </td>
          <td className="px-4 py-3">{fmtRank(u.avgCurrent)}</td>
          <td className="px-4 py-3">{u.inTop10}/{u.total}</td>
          <td className="px-4 py-3"><Sparkline data={u.aggSpark} /></td>
          <td className="px-4 py-3">
            <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-700">+{u.improved}</span>
            <span className="ml-2 rounded-lg bg-rose-50 px-2 py-0.5 text-rose-700">-{u.declined}</span>
          </td>
        </tr>
        {expanded.size === 0 ? null : ( // only render expanded content when virtualization is off
          expanded.has(u.displayUrl) && (
            <tr className="border-t border-slate-100 bg-slate-50/50">
              <td colSpan={7} className="px-6 py-4">
                <div className="text-xs text-slate-500 mb-2">關鍵字詳情：</div>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {u.items.map((it) => (
                    <KeywordDetailCard key={`${u.displayUrl}_${it.keyword}`} url={u.displayUrl} item={it} />
                  ))}
                </div>
              </td>
            </tr>
          )
        )}
      </React.Fragment>
    );
  }, [expanded, toggleExpand, copy]);

  // Virtual body component
  const VirtualBody = ({ items }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onScroll = () => setScrollTop(el.scrollTop);
      const onResize = () => setContainerHeight(el.clientHeight || 600);
      onResize();
      el.addEventListener('scroll', onScroll);
      window.addEventListener('resize', onResize);
      return () => {
        el.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
      };
    }, []);

    const overscan = 5;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visibleCount);
    const topPad = startIndex * ROW_HEIGHT;
    const bottomPad = (items.length - endIndex) * ROW_HEIGHT;
    const slice = items.slice(startIndex, endIndex);

    return (
      <tbody>
        <tr style={{ height: topPad }}><td colSpan={7} /></tr>
        {slice.map((u) => Row(u))}
        <tr style={{ height: bottomPad }}><td colSpan={7} /></tr>
      </tbody>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div ref={containerRef} className="max-h-[70vh] overflow-y-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-4 py-3">Display URL</th>
              <th className="px-4 py-3">Keywords</th>
              <th className="px-4 py-3">Best Current</th>
              <th className="px-4 py-3">Avg Current</th>
              <th className="px-4 py-3">Top10</th>
              <th className="px-4 py-3">Agg Trend</th>
              <th className="px-4 py-3">Win / Lose</th>
            </tr>
          </thead>
          {useVirtual ? (
            <VirtualBody items={view} />
          ) : (
            <tbody>
              {view.map((u) => Row(u))}
            </tbody>
          )}
        </table>
      </div>
      {view.length === 0 && (
        <div className="p-8 text-center text-slate-500">沒有符合條件的結果。</div>
      )}
    </div>
  );
}

// --- KeywordDetailCard with logging ----------------------------------------
function KeywordDetailCard({ url, item }) {
  const [note, setNote] = useState("");
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    setLogs(readLogs(url, item.keyword));
  }, [url, item.keyword]);

  const onAdd = () => {
    const next = addLog(url, item.keyword, note);
    setLogs(next);
    setNote("");
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 text-sm font-medium text-slate-800">{item.keyword}</div>
      <div className="mb-2 text-xs text-slate-500">Current: {fmtRank(item.end)} · Δ: <span className={`${item.delta > 0 ? 'text-emerald-600' : item.delta < 0 ? 'text-rose-600' : 'text-slate-600'}`}>{item.delta > 0 ? `+${item.delta}` : item.delta}</span></div>
      <Sparkline data={item.windowHist} />

      {/* Log input */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="新增備註（例如：調整標題、換 H1、內鏈優化）"
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none placeholder:text-slate-400 focus:border-slate-300"
        />
        <button onClick={onAdd} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100">Log</button>
      </div>

      {/* Log list (latest 3) */}
      <div className="mt-2 space-y-1">
        {logs.slice(0, 3).map((l, idx) => (
          <div key={idx} className="text-[11px] text-slate-600">
            <span className="mr-1 inline-block rounded bg-slate-100 px-1">{fmtTs(l.ts)}</span>
            {l.note}
          </div>
        ))}
        {logs.length === 0 && <div className="text-[11px] text-slate-400">尚無備註</div>}
      </div>
    </div>
  );
}

// --- Lightweight self-test suite (URL-only) ---------------------------------
function runSelfTests({ urlView, windowDays }) {
  console.groupCollapsed("KeywordRankDashboard · self-tests (URL-only)");
  try {
    // aggregateByUrl sanity
    const testRows = [
      { keyword: "a", displayUrl: "https://x", history: [5, 10, 15] },
      { keyword: "b", displayUrl: "https://x", history: [8, 9, 7] },
      { keyword: "c", displayUrl: "https://y", history: [50, 60, 70] },
      { keyword: "a", displayUrl: "https://x", history: [4, 12, 14] },
    ];
    const urlAgg = aggregateByUrl(dedupeRows(testRows), 3);
    console.assert(urlAgg.length === 2, "aggregateByUrl groups by URL after dedupe");
    const rowX = urlAgg.find((u) => u.displayUrl === "https://x");
    console.assert(rowX && rowX.total === 2, "URL x should have 2 keywords");
    console.assert(rowX && rowX.bestCurrent === 7, "Best current for x should be 7");
    console.assert(rowX && rowX.aggSpark.length === 3, "aggSpark length should equal windowDays");

    // trendDelta
    console.assert(trendDelta(20, 10) === 10, "trendDelta positive when improving");
    console.assert(trendDelta(10, 20) === -10, "trendDelta negative when declining");

    // urlView present
    console.assert(Array.isArray(urlView), "urlView is array");
    console.assert([7,30,90].includes(windowDays), "windowDays in preset");
  } catch (e) {
    console.error("Self-test failure:", e);
  } finally {
    console.groupEnd();
  }
}
