"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Sparkline from "../components/Sparkline";
import { useRankData } from "../context/rank-data";
import { MAX_VISIBLE_RANK, safeDecodeURL } from "../lib/rank-utils";

const WEEKDAY_LABELS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

const weekdayLabel = (fullDate) => {
  if (typeof fullDate !== "string") return "";
  const match = fullDate.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  const weekday = new Date(
    Date.UTC(
      Number.parseInt(y, 10),
      Number.parseInt(m, 10) - 1,
      Number.parseInt(d, 10),
    ),
  ).getUTCDay();
  return WEEKDAY_LABELS[weekday] || "";
};

export default function OverviewPage() {
  const {
    overviewData,
    windowDays,
    ensureOverviewMetrics,
    pageMetricsReady,
    pageMetricsRequested,
    pageTrafficLoading,
    pageTrafficError,
    keywordMetricsReady,
  } = useRankData();

  useEffect(() => {
    ensureOverviewMetrics();
  }, [ensureOverviewMetrics]);

  if (pageTrafficError) {
    return (
      <div className="text-sm text-rose-500">載入失敗：{pageTrafficError}</div>
    );
  }

  if (!pageMetricsReady) {
    if (pageTrafficLoading || !pageMetricsRequested) {
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

function DashboardOverview({ data, windowDays, keywordMetricsReady }) {
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
  const impressionsDisplay =
    data.impressionsCurrent != null
      ? Math.round(data.impressionsCurrent).toLocaleString()
      : "—";
  const impressionsDelta = formatDelta(data.impressionsDelta, {
    precision: 0,
    helper: data.comparisonHelper,
    suffix: " 次",
  });
  const clicksDisplay =
    data.clicksCurrent != null
      ? Math.round(data.clicksCurrent).toLocaleString()
      : "—";
  const clicksDelta = formatDelta(data.clicksDelta, {
    precision: 0,
    helper: data.comparisonHelper,
    suffix: " 次",
  });
  const ctrDisplay =
    data.ctrCurrent != null ? `${(data.ctrCurrent * 100).toFixed(1)}%` : "—";
  const ctrDelta = formatDelta(
    data.ctrDelta != null ? data.ctrDelta * 100 : null,
    { precision: 1, helper: data.comparisonHelper, suffix: "pp" },
  );
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
  const impressionsTrend = data.impressionsTrendSeries || [];
  const clicksTrend = data.clicksTrendSeries || [];
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
  const topPagesUp = data.pageMoversUp || [];
  const topPagesDown = data.pageMoversDown || [];
  const topQueriesUp = keywordMetricsLoaded ? data.queryMoversUp || [] : [];
  const topQueriesDown = keywordMetricsLoaded ? data.queryMoversDown || [] : [];

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

  const trafficTimeline = data.trafficTimeline || [];

  const chartData = useMemo(
    () =>
      trafficTimeline.map((point) => {
        const parseMetric = (value) => {
          if (value == null) return null;
          const num = Number(value);
          return Number.isFinite(num) ? num : null;
        };

        const impressions = parseMetric(
          point.impressions ??
            point.totalImpressions ??
            point.sumImpressions ??
            point.impressionsCurrent ??
            null,
        );
        const clicks = parseMetric(
          point.clicks ??
            point.totalClicks ??
            point.sumClicks ??
            point.clicksCurrent ??
            null,
        );

        let ctrPercent = null;
        const ctrRaw = parseMetric(
          point.ctr ?? point.clickThroughRate ?? point.ctrCurrent ?? null,
        );
        if (ctrRaw != null) {
          ctrPercent = Number((ctrRaw * 100).toFixed(2));
        } else if (impressions && impressions > 0 && clicks != null) {
          ctrPercent = Number(((clicks / impressions) * 100).toFixed(2));
        }

        return {
          date: point.date,
          fullDate: point.fullDate,
          impressions: impressions != null ? Math.round(impressions) : null,
          clicks: clicks != null ? Math.round(clicks) : null,
          ctrPercent,
        };
      }),
    [trafficTimeline],
  );

  const impressionsDomain = useMemo(() => {
    const values = chartData
      .map((row) => row.impressions)
      .filter((val) => val != null && Number.isFinite(val));
    if (!values.length) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding =
      span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : Math.abs(span) * 0.15;
    const lower = Math.max(0, Math.floor(min - padding));
    const upper = Math.ceil(max + padding);
    return [lower, upper <= lower ? lower + 1 : upper];
  }, [chartData]);

  const clicksDomain = useMemo(() => {
    const values = chartData
      .map((row) => row.clicks)
      .filter((val) => val != null && Number.isFinite(val));
    if (!values.length) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding =
      span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : Math.abs(span) * 0.15;
    const lower = Math.max(0, Math.floor(min - padding));
    const upper = Math.ceil(max + padding);
    return [lower, upper <= lower ? lower + 1 : upper];
  }, [chartData]);

  const percentDomain = [0, 30]; // 固定 CTR 範圍為 0-30%

  const weekendBands = useMemo(() => {
    if (!chartData.length) return [];

    const parseWeekday = (fullDate) => {
      if (typeof fullDate !== "string") return null;
      const isoMatch = fullDate.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (!isoMatch) return null;
      const [, yStr, mStr, dStr] = isoMatch;
      const year = Number.parseInt(yStr, 10);
      const month = Number.parseInt(mStr, 10) - 1;
      const day = Number.parseInt(dStr, 10);
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return null;
      }
      const timestamp = Date.UTC(year, month, day);
      return new Date(timestamp).getUTCDay();
    };

    const bands = [];
    for (let i = 0; i < chartData.length; i += 1) {
      const point = chartData[i];
      if (!point?.date) continue;
      const weekday = parseWeekday(point.fullDate);
      if (weekday == null) continue;

      if (weekday === 6) {
        const sunday = chartData[i + 1] ?? point;
        const nextWeekday = chartData[i + 2] ?? sunday;
        bands.push({
          key: `${point.fullDate || point.date}-weekend`,
          start: point.date,
          end: nextWeekday.date,
        });
      } else if (weekday === 0) {
        const prev = chartData[i - 1];
        const prevWeekday = prev ? parseWeekday(prev.fullDate) : null;
        if (prevWeekday !== 6) {
          const nextPoint = chartData[i + 1] ?? point;
          bands.push({
            key: `${point.fullDate || point.date}-sunday`,
            start: point.date,
            end: nextPoint.date,
          });
        }
      }
    }
    return bands.filter((band) => band.start && band.end);
  }, [chartData]);

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
        <SummaryCard
          title="曝光量"
          value={impressionsDisplay}
          delta={impressionsDelta}
          description={`最近 ${windowLabel}總曝光`}
          trend={impressionsTrend}
          trendVariant="metric"
          trendColor="#6366f1"
          trendFormatter={(v) => Number(v).toLocaleString()}
          unit="次"
        />
        <SummaryCard
          title="點擊量"
          value={clicksDisplay}
          delta={clicksDelta}
          description={`最近 ${windowLabel}總點擊`}
          trend={clicksTrend}
          trendVariant="metric"
          trendColor="#f97316"
          trendFormatter={(v) => Number(v).toLocaleString()}
          unit="次"
        />
        <SummaryCard
          title="CTR"
          value={ctrDisplay}
          delta={ctrDelta}
          description={`最近 ${windowLabel} 點擊率`}
        />
      </div>

      {chartData.some(
        (row) => (row.impressions ?? row.clicks ?? row.ctrPercent) != null,
      ) && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <span className="text-sm font-semibold text-slate-800">
                曝光量 / 點擊量 / CTR 趨勢
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 bg-yellow-400"></div>
                <span>CTR (%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 bg-orange-500"></div>
                <span>點擊量</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 bg-blue-400"></div>
                <span>曝光量</span>
              </div>
            </div>
          </div>
          <div className="h-80 w-full px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 24, right: 24, bottom: 12, left: 12 }}
              >
                <defs>
                  <linearGradient
                    id="areaImpressions"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="areaClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="areaCtr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#facc15" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#facc15" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(148,163,184,0.2)"
                  horizontal={true}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="rgba(71,85,105,0.6)"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="impressions"
                  stroke="rgba(71,85,105,0.6)"
                  domain={impressionsDomain}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) =>
                    Number.isFinite(value)
                      ? Number(value).toLocaleString()
                      : value
                  }
                />
                <YAxis
                  yAxisId="clicks"
                  orientation="right"
                  stroke="rgba(249,115,22,0.8)"
                  domain={clicksDomain}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) =>
                    Number.isFinite(value)
                      ? Number(value).toLocaleString()
                      : value
                  }
                />
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  stroke="rgba(250,204,21,0.8)"
                  domain={percentDomain}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload;
                    const impressions = payload.find(
                      (item) => item.dataKey === "impressions",
                    );
                    const clicks = payload.find(
                      (item) => item.dataKey === "clicks",
                    );
                    const ctr = payload.find(
                      (item) => item.dataKey === "ctrPercent",
                    );
                    const weekday = row?.fullDate
                      ? weekdayLabel(row.fullDate)
                      : "";
                    return (
                      <div className="rounded-md bg-white px-3 py-2 text-xs text-slate-900 shadow-lg border border-slate-200">
                        <div className="font-semibold text-slate-700">
                          {row?.fullDate || ""}
                          {weekday && (
                            <span className="ml-1 text-[11px] text-slate-400">
                              {weekday}
                            </span>
                          )}
                        </div>
                        {impressions && (
                          <div>
                            曝光：{Number(impressions.value).toLocaleString()}{" "}
                            次
                          </div>
                        )}
                        {clicks && (
                          <div>
                            點擊：{Number(clicks.value).toLocaleString()} 次
                          </div>
                        )}
                        {ctr && <div>CTR：{Number(ctr.value).toFixed(2)}%</div>}
                      </div>
                    );
                  }}
                />
                {weekendBands.map((band) => (
                  <ReferenceArea
                    key={band.key}
                    x1={band.start}
                    x2={band.end}
                    fill="rgba(148, 163, 184, 0.15)"
                    stroke={undefined}
                    ifOverflow="extendDomain"
                  />
                ))}
                <Area
                  yAxisId="impressions"
                  type="monotone"
                  dataKey="impressions"
                  name="曝光量"
                  stroke="#60a5fa"
                  strokeWidth={1.5}
                  fill="url(#areaImpressions)"
                  connectNulls
                />
                <Area
                  yAxisId="clicks"
                  type="monotone"
                  dataKey="clicks"
                  name="點擊量"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  fill="url(#areaClicks)"
                  connectNulls
                />
                <Area
                  yAxisId="percent"
                  type="monotone"
                  dataKey="ctrPercent"
                  name="CTR (%)"
                  stroke="#facc15"
                  strokeWidth={1.5}
                  fill="url(#areaCtr)"
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {(topPagesUp.length ||
        topPagesDown.length ||
        topQueriesUp.length ||
        topQueriesDown.length) > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MoverList
            title="Top 5 上升頁面"
            items={topPagesUp}
            emptyLabel="尚無資料"
          />
          <MoverList
            title="Top 5 下滑頁面"
            items={topPagesDown}
            emptyLabel="尚無資料"
          />
          <MoverList
            title="Top 5 上升關鍵字"
            items={topQueriesUp}
            emptyLabel="尚無資料"
          />
          <MoverList
            title="Top 5 下滑關鍵字"
            items={topQueriesDown}
            emptyLabel="尚無資料"
          />
        </div>
      )}

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
          className={`flex flex-wrap items-start gap-4 ${
            showComparison ? "" : "xl:flex-nowrap"
          }`}
        >
          <div
            className={`flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
              showComparison
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
}

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

function MoverList({ title, items, emptyLabel = "尚無資料", showUnit = true }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
      </div>
      <div className="flex-1">
        {items.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400">{emptyLabel}</div>
        ) : (
          <ol className="text-xs text-slate-700">
            {items.map((item, idx) => {
              const deltaLabel = item.delta > 0 ? `+${item.delta}` : item.delta;
              const unit = showUnit ? " 位" : "";
              const currentValue = Number(item.current || 0);
              const currentText = Number.isFinite(currentValue)
                ? currentValue.toLocaleString()
                : String(item.current ?? "—");
              const currentDisplay = `${currentText}${showUnit ? unit : ""}`;
              const decodedLabel =
                item.type === "page"
                  ? safeDecodeURL(item.label) || item.label
                  : item.label;
              const content = (
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-slate-800 max-w-[120px] sm:max-w-[140px]">
                    {decodedLabel}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                    <span className="text-slate-500">{currentDisplay}</span>
                    <span
                      className={`font-mono ${item.delta > 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {deltaLabel}
                      {unit}
                    </span>
                  </span>
                </div>
              );

              const itemClass = "block px-4 py-3 transition hover:bg-slate-50";
              const wrapperClass = idx === 0 ? "" : "border-t border-slate-100";

              return (
                <li key={`${item.label}-${idx}`} className={wrapperClass}>
                  {item.href ? (
                    <a
                      href={item.href}
                      className={`${itemClass} text-left`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {content}
                    </a>
                  ) : (
                    <div className={itemClass}>{content}</div>
                  )}
                </li>
              );
            })}
          </ol>
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
