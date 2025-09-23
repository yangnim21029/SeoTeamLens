"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Sparkline from "../components/Sparkline";
import { useRankData } from "../context/rank-data";
import { MAX_VISIBLE_RANK } from "../lib/rank-utils";

export default function OverviewPage() {
  const { overviewData } = useRankData();

  if (!overviewData) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">概覽</h1>
        <p className="text-sm text-slate-500">尚無可用的統計資料。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">整體概覽</h1>
        <p className="text-sm text-slate-500">快速掌握站點在不同期間的排名、覆蓋率與關鍵字動態。</p>
      </div>

      <DashboardOverview data={overviewData} />
    </div>
  );
}

function DashboardOverview({ data }) {
  const latestPoint = data.timeline.length ? data.timeline[data.timeline.length - 1] : null;
  const avgRankDisplay = data.avgRankCurrent != null ? data.avgRankCurrent.toFixed(1) : "—";
  const avgDelta = formatDelta(data.avgRankDelta, { precision: 1, helper: "vs 7 天前" });
  const netMovement = formatDelta(data.improvingKeywords - data.decliningKeywords, { precision: 0, suffix: " 淨值" });
  const top10Percent = data.top10Share != null ? (data.top10Share * 100).toFixed(1) : null;
  const dropPercent = data.dropShare != null ? (data.dropShare * 100).toFixed(1) : null;

  const chartData = useMemo(
    () =>
      data.timeline.map((point) => ({
        date: point.date,
        fullDate: point.fullDate,
        avgRank: point.avgRank != null ? Number(point.avgRank.toFixed(2)) : null,
        top10Share: Number((point.top10Share * 100).toFixed(1)),
        top20Share: Number((point.top20Share * 100).toFixed(1)),
      })),
    [data.timeline],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="追蹤 URL"
          value={data.totalUrls.toLocaleString()}
          description={`${data.totalKeywords.toLocaleString()} 個關鍵字聚合`}
        />
        <SummaryCard
          title="全站平均排名"
          value={avgRankDisplay}
          delta={avgDelta}
          description={latestPoint ? `樣本 ${latestPoint.sampleSize.toLocaleString()} 個關鍵字` : "尚無資料"}
          trend={data.trendSeries}
        />
        <SummaryCard
          title="關鍵字成長"
          value={data.improvingKeywords.toLocaleString()}
          delta={netMovement}
          description={`下降 ${data.decliningKeywords.toLocaleString()} 個`}
        />
        <SummaryCard
          title="Top 10 覆蓋率"
          value={top10Percent != null ? `${top10Percent}%` : "—"}
          description={`Top10 ${data.currentTop10.toLocaleString()} · 掉出 ${data.dropTop10.toLocaleString()}${dropPercent != null ? ` (${dropPercent}%)` : ""}`}
        />
      </div>

      {chartData.length > 3 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white shadow-sm">
          <div className="flex flex-col gap-1 px-5 pt-5">
            <span className="text-sm font-semibold text-slate-200">平均排名趨勢</span>
            <span className="text-xs text-slate-400">排名越低越好，含 Top10 / Top20 覆蓋率</span>
          </div>
          <div className="h-48 w-full px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="rank"
                  stroke="rgba(255,255,255,0.45)"
                  domain={[1, MAX_VISIBLE_RANK]}
                  reversed
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  yAxisId="share"
                  orientation="right"
                  stroke="rgba(255,255,255,0.25)"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload;
                    const avg = payload.find((item) => item.dataKey === "avgRank");
                    const top10 = payload.find((item) => item.dataKey === "top10Share");
                    const top20 = payload.find((item) => item.dataKey === "top20Share");
                    return (
                      <div className="rounded-md bg-white/90 px-3 py-2 text-xs text-slate-900 shadow">
                        <div className="font-semibold text-slate-700">{row?.fullDate || ""}</div>
                        {avg && <div>平均排名：{avg.value}</div>}
                        {top10 && <div>Top10 覆蓋：{top10.value}%</div>}
                        {top20 && <div>Top20 覆蓋：{top20.value}%</div>}
                      </div>
                    );
                  }}
                />
                <Line yAxisId="rank" type="monotone" dataKey="avgRank" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line yAxisId="share" type="monotone" dataKey="top10Share" stroke="#38bdf8" strokeWidth={1.75} strokeDasharray="5 4" dot={false} />
                <Line yAxisId="share" type="monotone" dataKey="top20Share" stroke="#facc15" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, description, delta, trend }) {
  const deltaTone =
    delta?.tone === "positive"
      ? "text-emerald-500"
      : delta?.tone === "negative"
        ? "text-rose-500"
        : "text-slate-400";

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-slate-900">{value}</span>
          {delta?.label && <span className={`text-xs font-medium ${deltaTone}`}>{delta.label}</span>}
        </div>
        {delta?.helper && <div className="mt-1 text-[11px] text-slate-400">{delta.helper}</div>}
        {description && <div className="mt-3 text-xs text-slate-500">{description}</div>}
      </div>
      {trend && trend.length > 0 && (
        <div className="mt-4">
          <Sparkline data={trend} className="h-14 w-full" />
        </div>
      )}
    </div>
  );
}

function formatDelta(value, { precision = 1, suffix = "", helper, positiveIsGood = true } = {}) {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Number(Math.abs(value).toFixed(precision));
  if (!rounded) {
    return { label: `±0${suffix}`, helper, tone: "neutral" };
  }
  const tone = value > 0 ? (positiveIsGood ? "positive" : "negative") : positiveIsGood ? "negative" : "positive";
  const sign = value > 0 ? "+" : "-";
  return { label: `${sign}${rounded}${suffix}`, helper, tone };
}
