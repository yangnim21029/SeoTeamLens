"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCcw } from "lucide-react";

import SectionCard from "../components/SectionCard";

const COLUMN_CONFIG = [
  { key: "label", label: "Project", align: "left" },
  { key: "site", label: "Site ID", align: "left" },
  { key: "urlCount", label: "Completed Pages", align: "right" },
  { key: "lastClicks", label: "Last Week\nClicks", align: "right" },
  { key: "prevClicks", label: "Period Week\nClicks", align: "right" },
  { key: "lastImpressions", label: "Last Week\nImpressions", align: "right" },
  {
    key: "prevImpressions",
    label: "Period Week\nImpressions",
    align: "right",
  },
  { key: "lastCtr", label: "Last Week\nCTR", align: "right" },
  { key: "prevCtr", label: "Period Week\nCTR", align: "right" },
  { key: "lastPosition", label: "Last Week\nPosition", align: "right" },
  { key: "prevPosition", label: "Period Week\nPosition", align: "right" },
];

function formatInteger(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString();
}

function formatPercent(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDecimal(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatSite(value) {
  if (!value) return "—";
  if (value.startsWith("sc-domain:")) {
    return value.replace("sc-domain:", "");
  }
  return value;
}

function clampToneLevel(level) {
  if (level >= 3) return "700";
  if (level >= 2) return "600";
  if (level >= 1) return "500";
  return "400";
}

function toneClass(delta, scale = "traffic", base = 0) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.00001)
    return "text-slate-600";
  let intensity = 0;
  if (scale === "traffic") {
    const denom = Math.max(Math.abs(base), 1);
    intensity = (Math.abs(delta) / denom) * 100;
  } else if (scale === "ratio") {
    intensity = Math.abs(delta) * 100;
  } else if (scale === "position") {
    intensity = Math.abs(delta);
  }
  const level =
    scale === "ratio"
      ? intensity >= 5
        ? 3
        : intensity >= 2
          ? 2
          : intensity >= 0.5
            ? 1
            : 0
      : intensity >= 50
        ? 3
        : intensity >= 20
          ? 2
          : intensity >= 5
            ? 1
            : 0;
  const palette =
    delta > 0
      ? `text-emerald-${clampToneLevel(level)}`
      : `text-rose-${clampToneLevel(level)}`;
  return palette;
}

function deriveTone(current, previous, type) {
  if (!Number.isFinite(current) || !Number.isFinite(previous))
    return "text-slate-600";
  if (type === "position") {
    const delta = previous - current;
    return toneClass(delta, "position");
  }
  const delta = current - previous;
  const scale = type === "ratio" ? "ratio" : "traffic";
  return toneClass(delta, scale, previous);
}

export default function SharePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/share/summary", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed with ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const rows = useMemo(() => {
    if (!data?.results) return [];
    return data.results.map((item) => {
      const current = item.current ?? {};
      const previous = item.previous ?? {};
      const siteLabel = formatSite(item.siteLabel || item.site);
      const siteDisplay = item.siteId || siteLabel;
      const clicksTone = deriveTone(
        current.clicks ?? NaN,
        previous.clicks ?? NaN,
        "traffic",
      );
      const impressionsTone = deriveTone(
        current.impressions ?? NaN,
        previous.impressions ?? NaN,
        "traffic",
      );
      const ctrTone = deriveTone(
        current.ctr ?? NaN,
        previous.ctr ?? NaN,
        "ratio",
      );
      const positionTone = deriveTone(
        current.position ?? NaN,
        previous.position ?? NaN,
        "position",
      );
      return {
        key: item.id,
        label: { value: item.label, tone: "text-slate-700" },
        site: {
          value: siteDisplay,
          tone: "text-slate-600",
        },
        urlCount: { value: formatInteger(item.urlCount), tone: "text-slate-600" },
        lastClicks: { value: formatInteger(current.clicks), tone: clicksTone },
        prevClicks: {
          value: formatInteger(previous.clicks),
          tone: "text-slate-400",
        },
        lastImpressions: {
          value: formatInteger(current.impressions),
          tone: impressionsTone,
        },
        prevImpressions: {
          value: formatInteger(previous.impressions),
          tone: "text-slate-400",
        },
        lastCtr: { value: formatPercent(current.ctr, 2), tone: ctrTone },
        prevCtr: {
          value: formatPercent(previous.ctr, 2),
          tone: "text-slate-400",
        },
        lastPosition: {
          value: formatDecimal(current.position, 2),
          tone: positionTone,
        },
        prevPosition: {
          value: formatDecimal(previous.position, 2),
          tone: "text-slate-400",
        },
      };
    });
  }, [data]);

  const tsv = data?.tsv ?? "";

  const handleCopy = useCallback(async () => {
    if (!tsv) return;
    try {
      await navigator.clipboard.writeText(tsv);
    } catch (err) {
      console.error("Failed to copy TSV", err);
    }
  }, [tsv]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            分享報表匯總
          </h1>
          <p className="text-sm text-slate-500">
            最近 {data?.windowDays ?? 7} 天與前一週比較，各專案點擊、曝光、CTR
            與平均排名。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSummary}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            disabled={!tsv}
          >
            <Copy className="h-4 w-4" />
            複製 TSV
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          載入失敗：{error}
        </div>
      )}

      <SectionCard
        header={
          <div>
            <span className="text-base font-semibold text-slate-800 sm:text-lg">
              專案列表
            </span>
            <span className="ml-2 text-xs text-slate-400">
              最近 {data?.windowDays ?? 7} 天
            </span>
          </div>
        }
        actions={
          <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
            共 {rows.length.toLocaleString()} 個專案
          </div>
        }
      >
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {COLUMN_CONFIG.map((col) => (
                  <th
                    key={col.key}
                    className={`whitespace-pre-line px-4 py-3 text-sm font-semibold text-slate-600 ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={COLUMN_CONFIG.length}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    生成中…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row, idx) => (
                  <tr
                    key={row.key}
                    className={`transition-colors ${
                      idx % 2 === 0
                        ? "bg-white hover:bg-slate-50"
                        : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    {COLUMN_CONFIG.map((col) => {
                      const cell = row[col.key];
                      const display =
                        cell && typeof cell === "object" ? cell.value : cell;
                      const tone =
                        cell && typeof cell === "object" && cell.tone
                          ? cell.tone
                          : "text-slate-600";
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-sm ${
                            col.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          <span className={`${tone} font-medium`}>{display}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={COLUMN_CONFIG.length}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    尚無資料。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        header={
          <div>
            <span className="text-base font-semibold text-slate-800 sm:text-lg">
              匯出
            </span>
            <span className="ml-2 text-xs text-slate-400">
              直接複製 TSV 進行分享
            </span>
          </div>
        }
        bodyClassName="space-y-3"
      >
        <textarea
          readOnly
          value={tsv}
          rows={6}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none"
        />
        {data?.errors?.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <div className="font-medium">部分專案無法載入：</div>
            <ul className="list-disc pl-5">
              {data.errors.map((err) => (
                <li key={err.id}>
                  {err.label}: {err.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data?.generatedAt && (
          <div className="text-xs text-slate-400">
            產生時間：{new Date(data.generatedAt).toLocaleString()}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
