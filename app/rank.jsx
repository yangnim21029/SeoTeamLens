"use client";

import React, {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Copy,
  Link as LinkIcon,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import Sparkline from "./components/Sparkline";
import {
  clampRank,
  fmtRank,
  isDropFromTopN,
  MAX_VISIBLE_RANK,
  safeDecodeURL,
} from "./lib/rank-utils";
import { useRankData } from "./context/rank-data";

// --- Main Page ----------------------------------------------------------------
export default function UrlRankingPage() {
  const {
    groupedBase,
    windowDays,
    loading,
    error,
    sourceMeta,
    totalUrls,
    totalKeywords,
  } = useRankData();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeFilter, setActiveFilter] = useState("none");
  const [expanded, setExpanded] = useState(() => new Set());
  const [isFiltering, startFiltering] = useTransition();
  const [showRawModal, setShowRawModal] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  const urlView = useMemo(() => {
    let view = groupedBase;
    const q = deferredQuery.trim().toLowerCase();
    if (q) {
      view = view.filter((group) => {
        const urlHit = group.displayUrl.toLowerCase().includes(q);
        const kwHit = group.items.some((it) =>
          it.keyword.toLowerCase().includes(q),
        );
        return urlHit || kwHit;
      });
    }

    if (activeFilter === "winners") {
      view = view.filter((g) => g.improved > 0);
    } else if (activeFilter === "decliners") {
      view = view.filter((g) => g.declined > 0);
    } else if (activeFilter === "top10") {
      view = view.filter((g) => g.inTop10 > 0);
    } else if (activeFilter === "notTop10") {
      view = view.filter((g) => g.inTop10 === 0);
    } else if (activeFilter === "drop10") {
      view = view.filter((g) =>
        g.items.some((it) => isDropFromTopN(it.start, it.end, 10)),
      );
    } else if (activeFilter === "drop20") {
      view = view.filter((g) =>
        g.items.some((it) => isDropFromTopN(it.start, it.end, 20)),
      );
    }

    return [...view].sort((a, b) => {
      const va = a.avgCurrent ?? 999;
      const vb = b.avgCurrent ?? 999;
      if (va !== vb) return va - vb;
      return b.inTop10 - a.inTop10;
    });
  }, [groupedBase, deferredQuery, activeFilter]);

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch { }
  }, []);

  const openRawModal = useCallback(() => setShowRawModal(true), []);
  const closeRawModal = useCallback(() => setShowRawModal(false), []);

  const tableSourceJson = useMemo(() => {
    try {
      return JSON.stringify(urlView, null, 2);
    } catch (error) {
      console.error("Failed to stringify urlView", error);
      return "(無法序列化資料)";
    }
  }, [urlView]);

  const toggleExpand = useCallback((url) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {(loading || error) && (
        <div className="overflow-hidden rounded-2xl bg-slate-100 px-6 py-4 text-sm text-slate-600 sm:px-8 sm:py-5">
          <div className="flex flex-wrap items-center gap-3">
            {loading && <span>載入中…</span>}
            {error && <span className="text-rose-600">載入失敗：{error}</span>}
          </div>
        </div>
      )}

      <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
        URL 檢視（多關鍵字聚合）
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋 URL 或關鍵字…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
            <span className="text-slate-500">篩選</span>
          </span>
          <ToggleButton
            label="上升"
            active={activeFilter === "winners"}
            onClick={() =>
              startFiltering(() =>
                setActiveFilter(
                  activeFilter === "winners" ? "none" : "winners",
                ),
              )
            }
          />
          <ToggleButton
            label="下滑"
            active={activeFilter === "decliners"}
            onClick={() =>
              startFiltering(() =>
                setActiveFilter(
                  activeFilter === "decliners" ? "none" : "decliners",
                ),
              )
            }
          />
          <ToggleButton
            label="Top 10"
            active={activeFilter === "top10"}
            onClick={() =>
              startFiltering(() =>
                setActiveFilter(activeFilter === "top10" ? "none" : "top10"),
              )
            }
          />
          <ToggleButton
            label="未進入 Top 10"
            active={activeFilter === "notTop10"}
            onClick={() =>
              startFiltering(() =>
                setActiveFilter(
                  activeFilter === "notTop10" ? "none" : "notTop10",
                ),
              )
            }
          />
          <ToggleButton
            label="掉出 Top 10"
            active={activeFilter === "drop10"}
            onClick={() =>
              startFiltering(() =>
                setActiveFilter(activeFilter === "drop10" ? "none" : "drop10"),
              )
            }
          />
          <ToggleButton
            label="掉出 Top 20"
            active={activeFilter === "drop20"}
            onClick={() =>
              startFiltering(() =>
                setActiveFilter(activeFilter === "drop20" ? "none" : "drop20"),
              )
            }
          />
          {isFiltering && (
            <span className="text-xs text-slate-400">更新中…</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <UrlTable
            view={urlView}
            expanded={expanded}
            toggleExpand={toggleExpand}
            copy={copy}
            windowDays={windowDays}
          />
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <div>* 排名數字愈小愈好；折線向上 = 排名提升。</div>
      </div>

      {isDev && sourceMeta && (
        <div className="fixed bottom-2 right-2 z-50 flex flex-col gap-1 rounded-lg bg-black/70 px-2 py-2 text-[11px] text-white shadow-lg backdrop-blur-sm">
          <div>
            SEO 參考｜Total URLs: {totalUrls} · Total Keywords: {totalKeywords}
            · CSV Rows: {sourceMeta.csvRows} · Parsed KWs: {" "}
            {sourceMeta.parsedKeywords} · Canonical URLs: {" "}
            {sourceMeta.canonicalUrls}
          </div>
          <button
            type="button"
            onClick={openRawModal}
            className="self-end rounded-md bg-white/15 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-white/25"
          >
            檢視表格原始資料
          </button>
        </div>
      )}

      {isDev && showRawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="relative w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  表格原始資料
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  目前頁面表格所使用的聚合資料；僅在開發模式顯示。
                </p>
              </div>
              <button
                type="button"
                onClick={closeRawModal}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
              >
                關閉
              </button>
            </div>
            <div className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-800">
                {tableSourceJson}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
    >
      {label}
    </button>
  );
}

// --- URL Table ----------------------------------------------------------------
function UrlTable({ view, expanded, toggleExpand, copy, windowDays }) {
  const containerRef = useRef(null);
  const ROW_HEIGHT = 64;
  const THRESHOLD = 50;
  const ALLOW_URL_WRAP = true;
  const useVirtual =
    !ALLOW_URL_WRAP && expanded.size === 0 && view.length > THRESHOLD;

  const Row = useCallback(
    (group) => {
      const isOpen = expanded.has(group.displayUrl);
      const visibleKeywords = isOpen ? group.items : group.items.slice(0, 3);
      return (
        <React.Fragment key={group.displayUrl}>
          <tr className="border-t border-slate-200/60 transition-colors hover:bg-slate-100/70">
            <td className="px-4 py-3">
              <div className="min-w-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(group.displayUrl)}
                  className="rounded-lg border border-slate-200 p-1 hover:bg-slate-100"
                  title="展開/收合"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={group.displayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-0 text-sky-600 hover:underline"
                >
                  <span className="inline-flex items-start gap-1 max-w-full break-all">
                    <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-all">
                      {safeDecodeURL(group.displayUrl)}
                    </span>
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => copy(group.displayUrl)}
                  className="rounded-lg border border-slate-200 p-1 hover:bg-slate-100"
                  title="Copy URL"
                >
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="text-slate-800">
                {visibleKeywords.map((it, idx) => (
                  <span key={it.keyword} className="block">
                    {isOpen ? `${idx + 1}. ${it.keyword}` : it.keyword}
                  </span>
                ))}
                {group.total > 3 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(group.displayUrl)}
                    className="mt-1 inline-flex items-center text-sky-600 hover:underline"
                  >
                    {isOpen ? "收合同列" : `展開全部（+${group.total - 3}）`}
                  </button>
                )}
              </div>
            </td>
            <td className="px-4 py-3 text-slate-700">
              {fmtRank(group.avgCurrent)}
            </td>
            <td className="px-4 py-3 text-slate-700">
              {group.inTop10}/{group.total}
            </td>
            <td className="px-4 py-3">
              <Sparkline data={group.aggSpark} />
            </td>
            <td className="px-4 py-3 text-sm">
              <span className="mr-2 text-emerald-600">↑ {group.improved}</span>
              <span className="text-rose-600">↓ {group.declined}</span>
            </td>
          </tr>
          {isOpen && (
            <tr className="border-t border-slate-200/60 bg-slate-100/60">
              <td colSpan={6} className="px-4 py-4">
                <KeywordDetailPanel
                  url={group.displayUrl}
                  items={group.items}
                  windowDays={windowDays}
                />
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    },
    [expanded, toggleExpand, copy, windowDays],
  );

  const VirtualBody = ({ items }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onScroll = () => setScrollTop(el.scrollTop);
      const onResize = () => setContainerHeight(el.clientHeight || 600);
      onResize();
      el.addEventListener("scroll", onScroll);
      window.addEventListener("resize", onResize);
      return () => {
        el.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
      };
    }, []);

    const overscan = 5;
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT) - overscan,
    );
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visibleCount);
    const topPad = startIndex * ROW_HEIGHT;
    const bottomPad = (items.length - endIndex) * ROW_HEIGHT;
    const slice = items.slice(startIndex, endIndex);

    return (
      <tbody>
        <tr style={{ height: topPad }}>
          <td colSpan={6} />
        </tr>
        {slice.map((group) => Row(group))}
        <tr style={{ height: bottomPad }}>
          <td colSpan={6} />
        </tr>
      </tbody>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100">
      <div className="px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
        {view.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white">
            <div ref={containerRef} className="max-h-[70vh] overflow-y-auto">
              <table className="min-w-full table-fixed text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="px-4 py-3">Display URL</th>
                    <th className="px-4 py-3">Keywords</th>
                    <th className="px-4 py-3">Avg Current</th>
                    <th className="px-4 py-3">Top10</th>
                    <th className="px-4 py-3">Agg Trend</th>
                    <th className="px-4 py-3">Win / Lose</th>
                  </tr>
                </thead>
                {useVirtual ? (
                  <VirtualBody items={view} />
                ) : (
                  <tbody>{view.map((group) => Row(group))}</tbody>
                )}
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white px-6 py-12 text-center text-slate-500">
            沒有符合條件的結果。
          </div>
        )}
      </div>
    </div>
  );
}

const KEYWORD_COLORS = [
  "#1d4ed8",
  "#0f766e",
  "#f97316",
  "#9d174d",
  "#7c3aed",
  "#059669",
  "#b45309",
  "#dc2626",
  "#0284c7",
  "#4c1d95",
  "#db2777",
  "#16a34a",
];

const KeywordDetailPanel = memo(function KeywordDetailPanel({
  url,
  items,
  windowDays,
}) {
  const [note, setNote] = useState("");
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    setLogs(readLogs(url));
  }, [url]);

  const dateSeries = useMemo(() => {
    const today = new Date();
    const baseUTC = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const anchorUTC = baseUTC - 24 * 60 * 60 * 1000;
    return Array.from({ length: windowDays }, (_, idx) => {
      const back = windowDays - 1 - idx;
      const d = new Date(anchorUTC);
      d.setUTCDate(d.getUTCDate() - back);
      return {
        short: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`,
        full: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      };
    });
  }, [windowDays]);

  const seriesMeta = useMemo(
    () =>
      items.map((it, idx) => ({
        dataKey: `kw${idx}`,
        keyword: it.keyword,
        color: KEYWORD_COLORS[idx % KEYWORD_COLORS.length],
        delta: it.delta,
        current: fmtRank(it.end),
      })),
    [items],
  );

  const chartData = useMemo(
    () =>
      dateSeries.map((d, idx) => {
        const row = { date: d.short, fullDate: d.full };
        items.forEach((it, lineIdx) => {
          row[`kw${lineIdx}`] = clampRank(it.windowHist[idx]);
        });
        return row;
      }),
    [dateSeries, items],
  );

  const onAdd = () => {
    const next = addLog(url, null, note);
    setLogs(next);
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-slate-100">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:flex-row lg:gap-6">
          {/* 左側圖表區域 */}
          <div className="flex-1 min-w-0">
            <div className="h-80 w-full rounded-xl border border-slate-200/60 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 16, right: 12, bottom: 16, left: 0 }}
                >
                  <YAxis
                    domain={[1, MAX_VISIBLE_RANK]}
                    reversed
                    tick={{ fontSize: 11 }}
                    width={32}
                  />
                  <XAxis
                    dataKey="date"
                    interval="preserveStartEnd"
                    tick={{ fontSize: 11 }}
                  />
                  <ReferenceArea
                    y1={1}
                    y2={10.001}
                    fill="#94a3b8"
                    fillOpacity={0.18}
                  />
                  <ReferenceArea
                    y1={10.001}
                    y2={30.001}
                    fill="#cbd5e1"
                    fillOpacity={0.12}
                  />
                  <ReferenceLine
                    y={10}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    ifOverflow="extendDomain"
                  />
                  <ReferenceLine
                    y={30}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    ifOverflow="extendDomain"
                  />
                  <CartesianGrid
                    horizontal
                    vertical={false}
                    strokeDasharray="3 3"
                    opacity={0.2}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const full = payload[0]?.payload?.fullDate || label;
                      return (
                        <div className="rounded-md bg-slate-900/90 px-3 py-2 text-xs text-white shadow">
                          <div className="mb-1 font-medium">{full}</div>
                          {payload.map((p) => {
                            const meta = seriesMeta.find(
                              (m) => m.dataKey === p.dataKey,
                            );
                            if (!meta) return null;
                            return (
                              <div
                                key={p.dataKey}
                                className="flex items-center gap-2"
                              >
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: meta.color }}
                                />
                                <span className="truncate" title={meta.keyword}>
                                  {meta.keyword}
                                </span>
                                <span className="ml-auto text-right">
                                  {fmtRank(p.value)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  {seriesMeta.map((meta) => (
                    <Line
                      key={meta.dataKey}
                      type="monotone"
                      dataKey={meta.dataKey}
                      stroke={meta.color}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 右側關鍵字清單 - 緊密設計，無間距 */}
          <div className="lg:w-80">
            <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white">
              <div className="divide-y divide-slate-200/60">
                {seriesMeta.map((meta, index) => (
                  <div
                    key={meta.dataKey}
                    className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-slate-100/70"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* 圓形圖例 */}
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />

                      {/* 關鍵字名稱 */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium text-sm text-slate-800 truncate"
                          title={meta.keyword}
                        >
                          {meta.keyword}
                        </div>
                      </div>
                    </div>

                    {/* 右側數值顯示 */}
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-800">
                        {meta.current}
                      </div>
                      {meta.delta !== 0 && (
                        <div className={`text-xs ${meta.delta > 0 ? "text-emerald-600" : "text-rose-600"
                          }`}>
                          {meta.delta > 0 ? `+${meta.delta}` : meta.delta}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-slate-100 px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-2 text-xs font-medium text-slate-500">調整紀錄</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="新增備註（例如：調整標題、換 H1、內鏈優化）"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-slate-400 focus:border-slate-300"
          />
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Log
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {logs.slice(0, 5).map((entry, idx) => (
            <div key={idx} className="text-[11px] text-slate-600">
              <span className="mr-2 inline-block rounded bg-slate-100 px-1 py-0.5">
                {fmtTs(entry.ts)}
              </span>
              {entry.note}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-[11px] text-slate-400">尚無備註</div>
          )}
        </div>
      </div>
    </div>
  );
});

// --- Logging helpers -----------------------------------------------------------
const LOG_PREFIX = "krd:log:";
function normalizeLogKeyword(keyword) {
  return keyword ? keyword.toLowerCase() : "__all__";
}

function logKey(url, keyword) {
  return `${LOG_PREFIX}${(url || "").toLowerCase()}::${normalizeLogKeyword(keyword)}`;
}

function readLogs(url, keyword = null) {
  try {
    const raw = localStorage.getItem(logKey(url, keyword));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLogs(url, keyword = null, logs) {
  try {
    localStorage.setItem(logKey(url, keyword), JSON.stringify(logs));
  } catch { }
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
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return String(ts);
  }
}
