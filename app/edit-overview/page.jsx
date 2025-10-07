"use client";

import React, { useEffect, useState, useTransition } from "react";

import { useRankData } from "../context/rank-data";

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
}

function buildDelta(value, suffix = "") {
  if (value == null || Number.isNaN(value) || value === 0) {
    return { label: `±0${suffix}`, tone: "neutral" };
  }
  const sign = value > 0 ? "+" : "";
  return {
    label: `${sign}${Math.round(value).toLocaleString()}${suffix}`,
    tone: value > 0 ? "positive" : "negative",
  };
}

function deltaToneClass(tone) {
  if (tone === "positive") return "text-emerald-500";
  if (tone === "negative") return "text-rose-500";
  return "text-slate-400";
}

export default function EditOverviewPage() {
  const {
    overviewData,
    windowDays,
    ensureOverviewMetrics,
    pageMetricsReady,
    pageMetricsRequested,
    pageTrafficLoading,
    pageTrafficError,
    activeProject,
  } = useRankData();

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

  const authorSummary = Array.isArray(overviewData.authorSummary)
    ? overviewData.authorSummary
    : [];
  const windowLabel = Number.isFinite(windowDays)
    ? `${windowDays.toLocaleString()} 天`
    : "近期";
  const totalAuthors = authorSummary.length;
  const totalImpressions = authorSummary.reduce(
    (sum, row) => sum + (Number(row.impressions) || 0),
    0,
  );
  const totalImpressionsPrev = authorSummary.reduce(
    (sum, row) => sum + (Number(row.impressionsPrev) || 0),
    0,
  );
  const impressionsDelta = totalImpressions - totalImpressionsPrev;
  const topAuthor = authorSummary[0] || null;
  const topAuthorDelta = topAuthor
    ? buildDelta(topAuthor.impressionsDelta, " 次")
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="作者總數"
          value={formatNumber(totalAuthors)}
          description={`最近 ${windowLabel} 內有曝光紀錄的作者`}
        />
        <SummaryCard
          title="作者總曝光"
          value={formatNumber(totalImpressions)}
          description={`上一期 ${formatNumber(totalImpressionsPrev)} 次`}
          delta={buildDelta(impressionsDelta, " 次")}
        />
        <SummaryCard
          title="最佳作者"
          value={topAuthor ? topAuthor.author : "—"}
          description={
            topAuthor
              ? `曝光 ${formatNumber(topAuthor.impressions)} 次，文章 ${formatNumber(topAuthor.articleCount)} 篇`
              : "尚無資料"
          }
          delta={topAuthorDelta}
        />
      </div>

      <AuthorTable
        windowLabel={windowLabel}
        showComparison={authorSummary.some((row) =>
          Number.isFinite(row.impressionsPrev),
        )}
        authorSummary={authorSummary}
      />
    </div>
  );
}

function SummaryCard({ title, value, description, delta }) {
  const toneClass = delta ? deltaToneClass(delta.tone) : "";

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-1 flex-col px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </div>
        <div className="mt-6">
          <span className="text-4xl font-semibold leading-none tracking-tight text-slate-900">
            {value}
          </span>
        </div>
        {(delta?.label || description) && (
          <div className="mt-5 space-y-2 text-xs font-semibold text-slate-600">
            {delta?.label && (
              <div className={`font-mono ${toneClass}`}>{delta.label}</div>
            )}
            {description && <div>{description}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function AuthorTable({ windowLabel, showComparison, authorSummary }) {
  const deltaClassName = (value) =>
    value > 0
      ? "text-emerald-500"
      : value < 0
        ? "text-rose-500"
        : "text-slate-400";

  const columnCount = showComparison ? 5 : 3;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <span className="text-sm font-semibold text-slate-800">
            作者曝光表現
          </span>
          <span className="ml-2 text-xs text-slate-400">最近 {windowLabel}</span>
        </div>
      </div>
      <div>
        <table className="min-w-full table-auto border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">作者</th>
              <th className="w-24 px-4 py-2 font-medium text-right">曝光量</th>
              {showComparison && (
                <th className="w-24 px-4 py-2 font-medium text-right">上一期</th>
              )}
              {showComparison && (
                <th className="w-20 px-4 py-2 font-medium text-right">Δ</th>
              )}
              <th className="w-20 px-4 py-2 font-medium text-right">文章數</th>
            </tr>
          </thead>
          <tbody>
            {authorSummary.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-slate-400" colSpan={columnCount}>
                  尚無資料
                </td>
              </tr>
            ) : (
              authorSummary.map((row, idx) => (
                <tr key={`${row.author}-${idx}`} className="border-t border-slate-100 text-slate-700">
                  <td className="px-4 py-2 align-top">
                    <div className="min-w-0 whitespace-normal break-words">
                      <div className="font-medium text-slate-800">{row.author}</div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right align-top font-mono text-[13px] text-slate-800">
                    {formatNumber(row.impressions)}
                  </td>
                  {showComparison && (
                    <td className="px-4 py-2 text-right align-top text-[11px] text-slate-500">
                      {formatNumber(row.impressionsPrev)}
                    </td>
                  )}
                  {showComparison && (
                    <td className="px-4 py-2 text-right align-top text-[11px] font-mono">
                      <span className={deltaClassName(row.impressionsDelta)}>
                        {buildDelta(row.impressionsDelta, " 次").label}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2 text-right align-top text-[13px] font-mono text-slate-600">
                    {formatNumber(row.articleCount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
