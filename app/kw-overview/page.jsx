"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";

import Sparkline from "../components/Sparkline";
import { useRankData } from "../context/rank-data";
import { MAX_VISIBLE_RANK } from "../lib/rank-utils";

export default function KeywordOverviewPage() {
  const {
    overviewData,
    windowDays,
    ensureOverviewMetrics,
    pageMetricsReady,
    pageMetricsRequested,
    pageTrafficLoading,
    pageTrafficError,
    keywordMetricsReady,
    activeProject,
  } = useRankData();

  // 使用 useTransition 來優化頁面切換
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      ensureOverviewMetrics();
    });
  }, [ensureOverviewMetrics]);

  if (!activeProject) {
    return (
      <div className="text-sm text-slate-500">
        請先選擇專案以載入統計資料。
      </div>
    );
  }

  if (pageTrafficError) {
    return (
      <div className="text-sm text-rose-500">載入失敗：{pageTrafficError}</div>
    );
  }

  if (!pageMetricsReady || isPending) {
    if (pageTrafficLoading || !pageMetricsRequested || isPending) {
      return <div className="text-sm text-slate-500">載入中…</div>;
    }
    return <div className="text-sm text-slate-500">尚無可用的統計資料。</div>;
  }

  if (!overviewData) {
    return <div className="text-sm text-slate-500">尚無可用的統計資料。</div>;
  }

  return (
    <DashboardOverview
      data={overviewData}
      windowDays={windowDays}
      keywordMetricsReady={keywordMetricsReady}
    />
  );
}

const DashboardOverview = React.memo(function DashboardOverview({ data, windowDays, keywordMetricsReady }) {
  const [showComparison, setShowComparison] = useState(false);
  const windowLabel = Number.isFinite(windowDays)
    ? `${windowDays.toLocaleString()} 天`
    : "近期";
  const avgRankDisplay =
    data.avgRankCurrent != null
      ? data.avgRankCurrent > MAX_VISIBLE_RANK
        ? `>${MAX_VISIBLE_RANK}`
        : data.avgRankCurrent.toFixed(1)
      : "—";
  const avgDelta = formatDelta(data.avgRankDelta, {
    precision: 1,
    helper: data.comparisonHelper,
  });
  const competitionRate =
    data.decliningUnique && data.keywordsWithRankCurrent
      ? data.decliningUnique / data.keywordsWithRankCurrent
      : null;
  const competitionCategory =
    competitionRate == null
      ? "—"
      : competitionRate > 0.1
        ? "高"
        : competitionRate > 0.05
          ? "中"
          : "低";
  const competitionDescriptor =
    competitionCategory === "高"
      ? "高度"
      : competitionCategory === "中"
        ? "中度"
        : competitionCategory === "低"
          ? "低度"
          : competitionCategory;
  const competitionTone =
    competitionRate == null
      ? "text-slate-500"
      : competitionRate > 0.1
        ? "text-rose-500"
        : competitionRate > 0.05
          ? "text-amber-500"
          : "text-emerald-500";
  const top10PercentValue =
    data.top10Share != null ? data.top10Share * 100 : null;
  const top10PercentPrevValue =
    data.top10SharePrevious != null ? data.top10SharePrevious * 100 : null;
  const top10Percent =
    top10PercentValue != null ? top10PercentValue.toFixed(1) : null;
  const top10PercentPrev =
    top10PercentPrevValue != null ? top10PercentPrevValue.toFixed(1) : null;
  const top10CountPrev = data.top10PreviousCount ?? null;
  const top10CountDelta =
    top10CountPrev != null ? data.currentTop10 - top10CountPrev : null;
  const top10Delta =
    top10CountDelta != null
      ? formatDelta(top10CountDelta, { precision: 0, suffix: " 個" })
      : null;
  const rankedKeywordsDisplay =
    data.keywordsWithRankCurrent != null
      ? data.keywordsWithRankCurrent.toLocaleString()
      : "—";
  const rankedKeywordsDelta = formatDelta(data.keywordsWithRankDelta, {
    precision: 0,
    helper: data.comparisonHelper,
    suffix: " 個",
  });
  const top10Trend = data.top10TrendSeries || [];
  const keywordTrend = data.keywordMovementTrend || [];
  const top20Trend = data.top20TrendSeries || [];
  const keywordMetricsLoaded = Boolean(keywordMetricsReady);
  const keywordSearchRows = keywordMetricsLoaded
    ? data.keywordSearchRows || []
    : [];
  const tagSearchSummary = keywordMetricsLoaded
    ? data.tagSearchSummary || []
    : [];
  const keywordMissingRows = keywordMetricsLoaded
    ? data.keywordMissingRows || []
    : [];
  const primaryDomain = data.primaryDomain || null;

  const keywordColumnMinWidth = 200;
  const keywordTableColumnCount = showComparison ? 5 : 3;
  const totalTagImpressions = useMemo(() => {
    if (!tagSearchSummary.length) return null;
    const sum = tagSearchSummary
      .map((row) => Number(row.impressions))
      .filter((val) => Number.isFinite(val) && val > 0)
      .reduce((acc, val) => acc + val, 0);
    return sum > 0 ? sum : null;
  }, [tagSearchSummary]);

  const formatDeltaText = (value, unitLabel = "") => {
    if (value == null || Number.isNaN(value) || value === 0)
      return `Δ ±0${unitLabel}`;
    const sign = value > 0 ? "+" : "";
    return `Δ ${sign}${Math.round(value).toLocaleString()}${unitLabel}`;
  };

  const deltaClassName = (value) =>
    value > 0
      ? "text-emerald-500"
      : value < 0
        ? "text-rose-500"
        : "text-slate-400";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="追蹤 URL"
          value={data.totalUrls.toLocaleString()}
          description={`${data.totalKeywords.toLocaleString()} 個關鍵字聚合`}
          unit="個"
          icon={
            primaryDomain ? (
              <img
                src={`https://www.google.com/s2/favicons?domain=${primaryDomain}&sz=64`}
                alt={primaryDomain}
                className="max-h-10 max-w-10 object-contain"
                data-domain={(() => {
                  const parts = primaryDomain.split(".");
                  const mainDomain =
                    parts.length > 2 ? parts[parts.length - 2] : parts[0];
                  return (
                    mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1)
                  );
                })()}
              />
            ) : (
              "URL"
            )
          }
        />
        <SummaryCard
          title="目標關鍵字平均排名"
          value={avgRankDisplay}
          delta={avgDelta}
          description={`總計 ${data.totalKeywords.toLocaleString()} 個關鍵字，取最近 ${windowLabel} 平均排名`}
          valueClassName={
            data.avgRankCurrent == null
              ? "text-slate-500"
              : data.avgRankCurrent >= 20
                ? "text-red-500"
                : data.avgRankCurrent >= 10
                  ? "text-yellow-500"
                  : "text-green-500"
          }
        />
        <SummaryCard
          title={`近${windowLabel}競爭程度`}
          value={
            competitionRate != null
              ? `${(competitionRate * 100).toFixed(1)}%`
              : "—"
          }
          description={`排名下滑關鍵字：${data.decliningUnique.toLocaleString()} 個 (近${windowLabel}) · 評級：出現${competitionDescriptor}競爭`}
          trend={keywordTrend}
          trendVariant="metric"
          trendColor="#f97316"
          trendFormatter={(v) => Number(v).toLocaleString()}
          valueClassName={competitionTone}
        />
        <SummaryCard
          title="有排名關鍵字"
          value={rankedKeywordsDisplay}
          delta={rankedKeywordsDelta}
          description={`最近 ${windowLabel} 內具排名的關鍵字數`}
          unit="個"
        />
        <SummaryCard
          title="目標關鍵字進入 TOP 10"
          value={
            data.currentTop10 != null ? data.currentTop10.toLocaleString() : "—"
          }
          delta={
            showComparison && top10Delta?.label
              ? { ...top10Delta, helper: undefined }
              : null
          }
          description={
            <span>
              <span
                className={`font-mono ${deltaClassName(top10CountDelta ?? 0)}`}
              >
                {top10CountDelta != null
                  ? `${top10CountDelta > 0 ? "+" : ""}${top10CountDelta.toLocaleString()} 個`
                  : "—"}
              </span>
              {showComparison && top10CountPrev != null && (
                <span> · 上期 {top10CountPrev.toLocaleString()} 個</span>
              )}
              {top10Percent != null && <span> · 佔比 {top10Percent}%</span>}
              {showComparison && top10PercentPrev != null && (
                <span> · 上期 {top10PercentPrev}%</span>
              )}
            </span>
          }
          trend={top10Trend}
          trendVariant="percent"
          trendColor="#0ea5e9"
          trendFormatter={(v) => `${Number(v).toFixed(1)}%`}
          secondaryTrend={top20Trend}
          secondaryVariant="percent"
          secondaryColor="#fbbf24"
          secondaryFormatter={(v) => `Top20 ${Number(v).toFixed(1)}%`}
          unit="個"
        />
      </div>
      <div className="w-full space-y-3">
        <div className="flex w-full justify-end px-1 text-xs text-slate-500">
          <label className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-slate-600">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-slate-300"
              checked={showComparison}
              onChange={(event) => setShowComparison(event.target.checked)}
            />
            顯示上一區間
          </label>
        </div>

        <div
          className={`flex flex-wrap items-start gap-4 ${showComparison ? "" : "xl:flex-nowrap"
            }`}
        >
          <div
            className={`flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${showComparison
              ? "min-w-[320px]"
              : "min-w-[200px] xl:max-w-[540px]"
              }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  關鍵字搜尋量
                </span>
                <span className="ml-2 text-xs text-slate-400">
                  最近 {windowLabel}
                </span>
              </div>
            </div>
            <div>
              <table className="min-w-full table-auto border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th
                      className="px-4 py-2 font-medium"
                      style={{ minWidth: `${keywordColumnMinWidth}px` }}
                    >
                      關鍵字
                    </th>
                    <th className="w-20 px-4 py-2 font-medium text-right">
                      搜尋量
                    </th>
                    {showComparison && (
                      <th className="w-20 px-4 py-2 font-medium text-right">
                        上一期
                      </th>
                    )}
                    {showComparison && (
                      <th className="w-20 px-4 py-2 font-medium text-right">
                        Δ
                      </th>
                    )}
                    <th className="w-24 px-4 py-2 font-medium">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {!keywordMetricsLoaded && (
                    <tr>
                      <td
                        className="px-4 py-3 text-slate-400"
                        colSpan={keywordTableColumnCount}
                      >
                        指標載入中…
                      </td>
                    </tr>
                  )}
                  {keywordMetricsLoaded && keywordSearchRows.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-3 text-slate-400"
                        colSpan={keywordTableColumnCount}
                      >
                        尚無資料
                      </td>
                    </tr>
                  )}
                  {keywordMetricsLoaded &&
                    keywordSearchRows.map((row, idx) => (
                      <tr
                        key={`${row.query}-${idx}`}
                        className="border-t border-slate-100 text-slate-700"
                      >
                        <td className="px-4 py-2 align-top">
                          <div className="min-w-0 whitespace-normal break-words">
                            <div className="font-medium text-slate-800">
                              {row.query}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right align-top font-mono text-[13px] text-slate-800">
                          <div>
                            {Math.round(row.impressions).toLocaleString()}
                          </div>
                        </td>
                        {showComparison && (
                          <td className="px-4 py-2 text-right align-top text-[11px] text-slate-500">
                            {Math.round(
                              row.impressionsPrev || 0,
                            ).toLocaleString()}
                          </td>
                        )}
                        {showComparison && (
                          <td className="px-4 py-2 text-right align-top text-[11px] font-mono">
                            <span
                              className={deltaClassName(row.impressionsDelta)}
                            >
                              {formatDeltaText(row.impressionsDelta, " 次")}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2 align-top text-slate-500">
                          {row.tag || "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-1 min-w-[260px] flex-col gap-4 lg:flex-row lg:flex-none lg:basis-[640px]">
            <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-w-[360px]">
              <div className="border-b border-slate-200 px-5 py-3">
                <span className="text-sm font-semibold text-slate-800">
                  Tag 搜尋量排名
                </span>
              </div>
              <div className="px-4 py-3">
                {!keywordMetricsLoaded ? (
                  <div className="text-sm text-slate-400">指標載入中…</div>
                ) : tagSearchSummary.length === 0 ? (
                  <div className="text-sm text-slate-400">尚無資料</div>
                ) : (
                  <ol className="space-y-2 text-sm text-slate-700">
                    {tagSearchSummary.map((row, idx) => {
                      const impressions = Number(row.impressions) || 0;
                      const share = totalTagImpressions
                        ? impressions / totalTagImpressions
                        : 0;
                      const percentLabel = totalTagImpressions
                        ? `${(share * 100).toFixed(1)}%`
                        : "";
                      return (
                        <li
                          key={row.tag}
                          className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50/40 p-3 last:mb-0"
                        >
                          {totalTagImpressions && (
                            <div
                              className="absolute inset-y-2 left-2 rounded-md bg-sky-100/70"
                              style={{
                                width: `${Math.min(100, Math.max(8, Math.round(share * 100)))}%`,
                              }}
                            />
                          )}
                          <div className="relative grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3">
                            <div className="flex items-center gap-2 font-medium text-slate-800">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[11px] font-semibold text-slate-500">
                                {idx + 1}
                              </span>
                              <span className="truncate" title={row.tag}>
                                {row.tag}
                              </span>
                            </div>
                            <div
                              className="text-xs text-slate-500 truncate"
                              title={row.region || row.site || ""}
                            >
                              {row.region || row.site || ""}
                            </div>
                            <span className="text-right">
                              <span className="block font-mono text-[12px] text-slate-700">
                                {Math.round(impressions).toLocaleString()}
                              </span>
                              {percentLabel && (
                                <span className="block text-[11px] text-slate-400">
                                  {percentLabel}
                                </span>
                              )}
                            </span>
                            {showComparison && (
                              <span className="text-right text-[11px] text-slate-500">
                                {Math.round(
                                  row.impressionsPrev || 0,
                                ).toLocaleString()}
                              </span>
                            )}
                            {showComparison && (
                              <span
                                className={`text-right text-[11px] font-mono ${deltaClassName(row.impressionsDelta)}`}
                              >
                                {formatDeltaText(row.impressionsDelta, " 次")}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:w-72">
              <div className="border-b border-slate-200 px-5 py-3">
                <span className="text-sm font-semibold text-slate-800">
                  區間無數據字詞
                </span>
              </div>
              <div className="px-4 py-3">
                {!keywordMetricsLoaded ? (
                  <div className="text-sm text-slate-400">指標載入中…</div>
                ) : keywordMissingRows.length === 0 ? (
                  <div className="text-sm text-slate-400">尚無資料</div>
                ) : (
                  <ol className="space-y-2 text-sm text-slate-700">
                    {keywordMissingRows.map((row, idx) => (
                      <li
                        key={`${row.query}-${idx}`}
                        className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium text-slate-800">
                            {row.query}
                          </span>
                          <span className="text-xs text-slate-400">
                            {row.tag || "未分類"}
                          </span>
                        </span>
                        <span className="font-mono text-[12px] text-slate-600">
                          {row.volume ? row.volume.toLocaleString() : "—"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
});

function SummaryCard({
  title,
  value,
  description,
  delta,
  trend,
  trendVariant = "rank",
  trendColor,
  trendFormatter,
  secondaryTrend,
  secondaryVariant,
  secondaryColor,
  secondaryFormatter,
  valueClassName = "",
  unit,
  icon,
}) {
  const deltaTone =
    delta?.tone === "positive"
      ? "text-emerald-500"
      : delta?.tone === "negative"
        ? "text-rose-500"
        : "text-slate-400";

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {icon && (
        <div className="flex h-24 items-center justify-center bg-white px-4 py-4 rounded-t-2xl mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden">
              {typeof icon === "object" && icon?.type === "img" ? (
                icon
              ) : (
                <span className="text-xl font-semibold text-slate-600">
                  {icon}
                </span>
              )}
            </div>
            {typeof icon === "object" && icon?.props?.["data-domain"] && (
              <div className="text-2xl font-bold text-slate-700">
                {icon.props["data-domain"]}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col px-4 py-4 rounded-b-2xl border-t border-slate-200">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </div>
        <div className="mt-6">
          <span
            className={`text-4xl font-semibold leading-none tracking-tight ${valueClassName || "text-slate-900"}`}
          >
            {value}
          </span>
        </div>
        {(delta?.label || delta?.helper) && (
          <div className="mt-4 text-xs font-semibold text-slate-500">
            {delta?.label && (
              <span className={`font-mono font-semibold ${deltaTone}`}>
                {delta.label}
              </span>
            )}
            {delta?.helper && (
              <span className="ml-2 text-slate-500">{delta.helper}</span>
            )}
          </div>
        )}
        {description && (
          <div className="mt-5 text-xs font-semibold text-slate-600">
            {description}
          </div>
        )}
        {trend && trend.length > 0 && (
          <div className="mt-6">
            <Sparkline
              data={trend}
              secondaryData={secondaryTrend}
              secondaryVariant={secondaryVariant}
              secondaryColor={secondaryColor}
              secondaryFormatter={secondaryFormatter}
              className="h-14 w-full"
              variant={trendVariant}
              color={trendColor}
              valueFormatter={trendFormatter}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatDelta(
  value,
  { precision = 1, suffix = "", helper, positiveIsGood = true } = {},
) {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Number(Math.abs(value).toFixed(precision));
  if (!rounded) {
    return { label: `±0${suffix}`, helper, tone: "neutral" };
  }
  const tone =
    value > 0
      ? positiveIsGood
        ? "positive"
        : "negative"
      : positiveIsGood
        ? "negative"
        : "positive";
  const sign = value > 0 ? "+" : "-";
  return { label: `${sign}${rounded}${suffix}`, helper, tone };
}
