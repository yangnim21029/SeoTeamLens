"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";

import { useRankData } from "../context/rank-data";

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  const percent = value * 100;
  if (!Number.isFinite(percent)) return "—";
  const decimals = Math.abs(percent) >= 10 ? 1 : 2;
  return `${percent.toFixed(decimals)}%`;
}

function formatRank(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
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

function formatPath(input) {
  if (!input || typeof input !== "string") return "";
  try {
    const url = new URL(input);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${pathname}${url.search || ""}`;
  } catch {
    return input.replace(/^https?:\/\/[^/]+/i, "") || input;
  }
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
  const [selectedAuthorKey, setSelectedAuthorKey] = useState(null);
  const [authorSort, setAuthorSort] = useState({
    column: "impressions",
    direction: "desc",
  });

  useEffect(() => {
    startTransition(() => {
      ensureOverviewMetrics();
    });
  }, [ensureOverviewMetrics]);

  useEffect(() => {
    const summary = Array.isArray(overviewData?.authorSummary)
      ? overviewData.authorSummary
      : [];
    if (!summary.length) {
      setSelectedAuthorKey(null);
      return;
    }
    setSelectedAuthorKey((previous) => {
      if (previous && summary.some((row) => row.authorKey === previous)) {
        return previous;
      }
      return summary[0]?.authorKey || null;
    });
  }, [overviewData]);

  const authorSummary = Array.isArray(overviewData?.authorSummary)
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
  const totalClicks = authorSummary.reduce(
    (sum, row) => sum + (Number(row.clicks) || 0),
    0,
  );
  const totalClicksPrev = authorSummary.reduce(
    (sum, row) => sum + (Number(row.clicksPrev) || 0),
    0,
  );
  const clicksDelta = totalClicks - totalClicksPrev;
  const avgCtr =
    totalImpressions > 0 ? totalClicks / totalImpressions : null;
  const avgCtrPrev =
    totalImpressionsPrev > 0 ? totalClicksPrev / totalImpressionsPrev : null;
  const topAuthor = authorSummary[0] || null;
  const topAuthorDelta = topAuthor
    ? buildDelta(topAuthor.impressionsDelta, " 次")
    : null;
  const topAuthorClicksLabel = topAuthor
    ? formatNumber(topAuthor.clicks)
    : "—";
  const topAuthorCtrLabel = topAuthor
    ? formatPercent(topAuthor.ctr)
    : "—";
  const avgCtrLabel = formatPercent(avgCtr);
  const avgCtrPrevLabel = formatPercent(avgCtrPrev);

  const sortedAuthorSummary = useMemo(() => {
    if (!authorSummary.length) return [];
    const accessors = {
      author: (row) => (row.author || "").toLowerCase(),
      impressions: (row) => Number(row.impressions) || 0,
      impressionsPrev: (row) => Number(row.impressionsPrev) || 0,
      impressionsDelta: (row) => Number(row.impressionsDelta) || 0,
      clicks: (row) => Number(row.clicks) || 0,
      clicksPrev: (row) => Number(row.clicksPrev) || 0,
      clicksDelta: (row) => Number(row.clicksDelta) || 0,
      avgRank: (row) =>
        Number.isFinite(row.avgRank) ? Number(row.avgRank) : Number.POSITIVE_INFINITY,
      ctr: (row) =>
        Number.isFinite(row.ctr) ? Number(row.ctr) : Number.NEGATIVE_INFINITY,
      articleCount: (row) => Number(row.articleCount) || 0,
    };

    const direction = authorSort.direction === "asc" ? 1 : -1;
    const accessor =
      accessors[authorSort.column] || accessors.impressions;

    return [...authorSummary].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);

      if (
        typeof aVal === "string" ||
        typeof bVal === "string" ||
        authorSort.column === "author"
      ) {
        const result = String(aVal || "").localeCompare(
          String(bVal || ""),
          "zh-Hant",
          { sensitivity: "base" },
        );
        if (result !== 0) return result * direction;
      } else {
        const aNum = Number.isFinite(aVal)
          ? Number(aVal)
          : Number.NEGATIVE_INFINITY;
        const bNum = Number.isFinite(bVal)
          ? Number(bVal)
          : Number.NEGATIVE_INFINITY;
        if (aNum !== bNum) {
          return direction === "asc" ? aNum - bNum : bNum - aNum;
        }
      }

      const aImpr = Number.isFinite(a.impressions)
        ? Number(a.impressions)
        : Number.NEGATIVE_INFINITY;
      const bImpr = Number.isFinite(b.impressions)
        ? Number(b.impressions)
        : Number.NEGATIVE_INFINITY;
      if (aImpr !== bImpr) return bImpr - aImpr;

      return String(a.author || "").localeCompare(
        String(b.author || ""),
        "zh-Hant",
        { sensitivity: "base" },
      );
    });
  }, [authorSummary, authorSort]);

  const handleAuthorSortChange = useCallback((column) => {
    setAuthorSort((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === "desc" ? "asc" : "desc",
        };
      }
      const defaultDirection =
        column === "author" || column === "avgRank" ? "asc" : "desc";
      return {
        column,
        direction: defaultDirection,
      };
    });
  }, []);

  const selectedAuthor =
    authorSummary.find((row) => row.authorKey === selectedAuthorKey) || null;

  const cardMessage = (children, tone = "default") => (
    <div className="overflow-hidden rounded-2xl bg-slate-100">
      <div
        className={`px-6 py-8 text-sm sm:px-8 ${
          tone === "error" ? "text-rose-500" : "text-slate-500"
        }`}
      >
        {children}
      </div>
    </div>
  );

  const statusContent = (() => {
    if (!activeProject) {
      return cardMessage("請先選擇專案以載入統計資料。");
    }

    if (pageTrafficError) {
      return cardMessage(`載入失敗：${pageTrafficError}`, "error");
    }

    if (!pageMetricsReady || isPending) {
      if (pageTrafficLoading || !pageMetricsRequested || isPending) {
        return cardMessage("載入中…");
      }
      return cardMessage("尚無可用的統計資料。");
    }
    if (!overviewData) {
      return cardMessage("尚無可用的統計資料。");
    }

    return null;
  })();

  if (statusContent) {
    return statusContent;
  }

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
          title="作者總點擊"
          value={formatNumber(totalClicks)}
          description={`上一期 ${formatNumber(totalClicksPrev)} 次，平均點擊率 ${avgCtrLabel}${avgCtrPrev != null ? `（上一期 ${avgCtrPrevLabel}）` : ""}`}
          delta={buildDelta(clicksDelta, " 次")}
        />
        <SummaryCard
          title="最佳作者"
          value={topAuthor ? topAuthor.author : "—"}
          description={
            topAuthor
              ? `曝光 ${formatNumber(topAuthor.impressions)} 次，點擊 ${topAuthorClicksLabel} 次，點擊率 ${topAuthorCtrLabel}，平均排名 ${formatRank(topAuthor.avgRank)}，文章 ${formatNumber(topAuthor.articleCount)} 篇`
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
        authorSummary={sortedAuthorSummary}
        selectedAuthorKey={selectedAuthorKey}
        onSelectAuthor={setSelectedAuthorKey}
        sortState={authorSort}
        onSortChange={handleAuthorSortChange}
      />
      <AuthorArticlesPanel
        author={selectedAuthor}
        windowLabel={windowLabel}
      />
    </div>
  );
}

function SummaryCard({ title, value, description, delta }) {
  const toneClass = delta ? deltaToneClass(delta.tone) : "";

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-slate-100">
      <div className="flex flex-1 flex-col px-6 py-6 sm:px-8 sm:py-8">
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

function AuthorTable({
  windowLabel,
  showComparison,
  authorSummary,
  selectedAuthorKey,
  onSelectAuthor,
  sortState,
  onSortChange,
}) {
  const deltaClassName = (value) =>
    value > 0
      ? "text-emerald-500"
      : value < 0
        ? "text-rose-500"
        : "text-slate-400";

  const columnCount = showComparison ? 10 : 7;
  const getSortIndicator = (column) => {
    if (!sortState || sortState.column !== column) return "↕";
    return sortState.direction === "asc" ? "▲" : "▼";
  };
  const getSortIndicatorClass = (column) =>
    sortState && sortState.column === column
      ? "text-slate-700"
      : "text-slate-300";
  const handleSort = (column) => {
    if (onSortChange) onSortChange(column);
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4 sm:px-8 sm:py-5">
        <div>
          <span className="text-base font-semibold text-slate-800 sm:text-lg">
            作者曝光表現
          </span>
          <span className="ml-2 text-xs text-slate-400">最近 {windowLabel}</span>
        </div>
      </div>
      <div className="px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
        <table className="min-w-full table-auto border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-12 px-4 py-2 font-medium text-center">排名</th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("author")}
                  className="flex w-full items-center justify-start gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                >
                  <span>作者</span>
                  <span
                    className={`text-[10px] ${getSortIndicatorClass("author")}`}
                  >
                    {getSortIndicator("author")}
                  </span>
                </button>
              </th>
              <th className="w-24 px-4 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => handleSort("impressions")}
                  className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                >
                  <span>曝光量</span>
                  <span
                    className={`text-[10px] ${getSortIndicatorClass("impressions")}`}
                  >
                    {getSortIndicator("impressions")}
                  </span>
                </button>
              </th>
              {showComparison && (
                <th className="w-24 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("impressionsPrev")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>上一期</span>
                    <span
                      className={`text-[10px] ${getSortIndicatorClass("impressionsPrev")}`}
                    >
                      {getSortIndicator("impressionsPrev")}
                    </span>
                  </button>
                </th>
              )}
              {showComparison && (
                <th className="w-20 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("impressionsDelta")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>Δ</span>
                    <span
                      className={`text-[10px] ${getSortIndicatorClass("impressionsDelta")}`}
                    >
                      {getSortIndicator("impressionsDelta")}
                    </span>
                  </button>
                </th>
              )}
              <th className="w-24 px-4 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => handleSort("clicks")}
                  className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                >
                  <span>點擊次數</span>
                  <span
                    className={`text-[10px] ${getSortIndicatorClass("clicks")}`}
                  >
                    {getSortIndicator("clicks")}
                  </span>
                </button>
              </th>
              {showComparison && (
                <th className="w-24 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("clicksDelta")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>點擊變化</span>
                    <span
                      className={`text-[10px] ${getSortIndicatorClass("clicksDelta")}`}
                    >
                      {getSortIndicator("clicksDelta")}
                    </span>
                  </button>
                </th>
              )}
              <th className="w-24 px-4 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => handleSort("avgRank")}
                  className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                >
                  <span>平均排名</span>
                  <span
                    className={`text-[10px] ${getSortIndicatorClass("avgRank")}`}
                  >
                    {getSortIndicator("avgRank")}
                  </span>
                </button>
              </th>
              <th className="w-20 px-4 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => handleSort("ctr")}
                  className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                >
                  <span>點擊率</span>
                  <span
                    className={`text-[10px] ${getSortIndicatorClass("ctr")}`}
                  >
                    {getSortIndicator("ctr")}
                  </span>
                </button>
              </th>
              <th className="w-20 px-4 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => handleSort("articleCount")}
                  className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                >
                  <span>文章數</span>
                  <span
                    className={`text-[10px] ${getSortIndicatorClass("articleCount")}`}
                  >
                    {getSortIndicator("articleCount")}
                  </span>
                </button>
              </th>
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
              authorSummary.map((row, idx) => {
                const isSelected =
                  row.authorKey && row.authorKey === selectedAuthorKey;
                const rowKey = row.authorKey || `${row.author}-${idx}`;
                const zebraClass =
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/60";
                const interactionClass = onSelectAuthor
                  ? "cursor-pointer hover:bg-slate-50"
                  : "";
                const selectedClass = isSelected
                  ? "bg-slate-200/70 hover:bg-slate-200/70"
                  : zebraClass;
                return (
                  <tr
                    key={rowKey}
                    className={`border-t border-slate-100 text-slate-700 transition-colors ${interactionClass} ${selectedClass}`}
                    onClick={() => {
                      if (onSelectAuthor && row.authorKey) {
                        onSelectAuthor(row.authorKey);
                      }
                    }}
                    aria-selected={isSelected}
                  >
                  <td className="px-4 py-2 text-center align-top text-xs font-semibold text-slate-500">
                    {idx + 1}
                  </td>
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
                  <td className="px-4 py-2 text-right align-top font-mono text-[13px] text-slate-800">
                    {formatNumber(row.clicks)}
                  </td>
                  {showComparison && (
                    <td className="px-4 py-2 text-right align-top text-[11px] font-mono">
                      <span className={deltaClassName(row.clicksDelta)}>
                        {buildDelta(row.clicksDelta, " 次").label}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2 text-right align-top font-mono text-[13px] text-slate-600">
                    {formatRank(row.avgRank)}
                  </td>
                  <td className="px-4 py-2 text-right align-top text-[13px] font-mono text-slate-600">
                    {formatPercent(row.ctr)}
                  </td>
                  <td className="px-4 py-2 text-right align-top text-[13px] font-mono text-slate-600">
                    {formatNumber(row.articleCount)}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthorArticlesPanel({ author, windowLabel }) {
  const [articleSort, setArticleSort] = useState({
    column: "impressions",
    direction: "desc",
  });

  const authorIdentity = author?.authorKey || author?.author || "";
  const articles = Array.isArray(author?.articles) ? author.articles : [];

  useEffect(() => {
    setArticleSort({ column: "impressions", direction: "desc" });
  }, [authorIdentity]);

  const sortedArticles = useMemo(() => {
    if (!articles.length) return [];
    const accessors = {
      keywords: (row) =>
        Array.isArray(row.keywordsFull) && row.keywordsFull.length
          ? row.keywordsFull.join(" / ")
          : Array.isArray(row.keywords) && row.keywords.length
            ? row.keywords.join(" / ")
            : "",
      impressions: (row) => Number(row.impressions) || 0,
      clicks: (row) => Number(row.clicks) || 0,
      avgRank: (row) =>
        Number.isFinite(row.avgRank) ? Number(row.avgRank) : Number.POSITIVE_INFINITY,
      ctr: (row) =>
        Number.isFinite(row.ctr) ? Number(row.ctr) : Number.NEGATIVE_INFINITY,
    };

    const accessor =
      accessors[articleSort.column] || accessors.impressions;
    const directionMultiplier = articleSort.direction === "asc" ? 1 : -1;

    return [...articles].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);

      const isStringSort =
        articleSort.column === "keywords" ||
        typeof aVal === "string" ||
        typeof bVal === "string";

      if (isStringSort) {
        const result = String(aVal || "").localeCompare(
          String(bVal || ""),
          "zh-Hant",
          { sensitivity: "base" },
        );
        if (result !== 0) return result * directionMultiplier;
      } else {
        const aNum = Number.isFinite(aVal)
          ? Number(aVal)
          : Number.NEGATIVE_INFINITY;
        const bNum = Number.isFinite(bVal)
          ? Number(bVal)
          : Number.NEGATIVE_INFINITY;
        if (aNum !== bNum) {
          return directionMultiplier === "asc" ? aNum - bNum : bNum - aNum;
        }
      }

      const fallback = Number.isFinite(a.impressions) && Number.isFinite(b.impressions)
        ? Number(b.impressions) - Number(a.impressions)
        : 0;
      if (fallback !== 0) return fallback;

      return String(a.url || a.title || "").localeCompare(
        String(b.url || b.title || ""),
        "zh-Hant",
        { sensitivity: "base" },
      );
    });
  }, [articles, articleSort]);

  if (!author) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-4 text-sm text-slate-500">
          請從上方列表選擇作者以檢視文章成效。
        </div>
      </div>
    );
  }

  const getArticleSortIndicator = (column) => {
    if (!articleSort || articleSort.column !== column) return "↕";
    return articleSort.direction === "asc" ? "▲" : "▼";
  };

  const getArticleSortIndicatorClass = (column) =>
    articleSort && articleSort.column === column
      ? "text-slate-700"
      : "text-slate-300";

  const handleArticleSort = (column) => {
    setArticleSort((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === "desc" ? "asc" : "desc",
        };
      }
      const defaultDirection =
        column === "keywords" || column === "avgRank" ? "asc" : "desc";
      return {
        column,
        direction: defaultDirection,
      };
    });
  };
  const headerStats = [
    `總曝光 ${formatNumber(author.impressions)}`,
    `總點擊 ${formatNumber(author.clicks)}`,
    `點擊率 ${formatPercent(author.ctr)}`,
    `平均排名 ${formatRank(author.avgRank)}`,
  ].join(" · ");

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200/60 px-6 py-4 sm:px-8 sm:py-5">
        <div className="flex flex-col">
          <span className="text-base font-semibold text-slate-800 sm:text-lg">
            {author.author} 的文章成效
          </span>
          <span className="text-xs text-slate-400">
            最近 {windowLabel} ・ {articles.length.toLocaleString()} 篇文章
          </span>
        </div>
        <div className="text-xs text-slate-400">{headerStats}</div>
      </div>
      {sortedArticles.length === 0 ? (
        <div className="px-6 py-6 text-sm text-slate-500 sm:px-8 sm:py-8">
          尚無文章成效資料。
        </div>
      ) : (
        <div className="px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
          <table className="min-w-full table-auto border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleArticleSort("keywords")}
                    className="flex w-full items-center justify-between gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>文章</span>
                    <span
                      className={`text-[10px] ${getArticleSortIndicatorClass("keywords")}`}
                    >
                      {getArticleSortIndicator("keywords")}
                    </span>
                  </button>
                </th>
                <th className="w-24 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleArticleSort("impressions")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>曝光量</span>
                    <span
                      className={`text-[10px] ${getArticleSortIndicatorClass("impressions")}`}
                    >
                      {getArticleSortIndicator("impressions")}
                    </span>
                  </button>
                </th>
                <th className="w-24 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleArticleSort("clicks")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>點擊次數</span>
                    <span
                      className={`text-[10px] ${getArticleSortIndicatorClass("clicks")}`}
                    >
                      {getArticleSortIndicator("clicks")}
                    </span>
                  </button>
                </th>
                <th className="w-24 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleArticleSort("avgRank")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>平均排名</span>
                    <span
                      className={`text-[10px] ${getArticleSortIndicatorClass("avgRank")}`}
                    >
                      {getArticleSortIndicator("avgRank")}
                    </span>
                  </button>
                </th>
                <th className="w-20 px-4 py-2 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => handleArticleSort("ctr")}
                    className="flex w-full items-center justify-end gap-1 text-xs font-semibold text-slate-500 whitespace-nowrap"
                  >
                    <span>點擊率</span>
                    <span
                      className={`text-[10px] ${getArticleSortIndicatorClass("ctr")}`}
                    >
                      {getArticleSortIndicator("ctr")}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedArticles.map((article, idx) => {
                const title = typeof article.title === "string" ? article.title.trim() : "";
                const path = formatPath(article.canonicalUrl || article.url || "");
                const keywords = Array.isArray(article.keywords)
                  ? article.keywords.filter((token) => typeof token === "string" && token.trim())
                  : [];
                const fullKeywords =
                  Array.isArray(article.keywordsFull) && article.keywordsFull.length
                    ? article.keywordsFull.filter((token) => typeof token === "string" && token.trim())
                    : keywords;
                const keywordsTooltip =
                  fullKeywords.length > 0 ? fullKeywords.join(" / ") : "";
                const hasKeywords = keywords.length > 0;
                const primaryKeyword = hasKeywords ? keywords[0] : "";
                const secondaryKeywords = hasKeywords ? keywords.slice(1) : [];
                const keywordsDisplay = hasKeywords
                  ? [primaryKeyword, ...secondaryKeywords].join(" / ")
                  : "";
                const fallbackText = "(未提供關鍵字)";
                const containerTooltip =
                  keywordsTooltip || title || path || article.url || "";
                const zebraClass =
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/60";
                return (
                  <tr
                    key={`${article.canonicalUrl || article.url || idx}`}
                    className={`group border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-100 ${zebraClass}`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-0 whitespace-normal break-words">
                        <div
                          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-600 transition-colors group-hover:bg-slate-100/70"
                          title={containerTooltip || undefined}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                            {hasKeywords ? (
                              <>
                                <span className="flex-shrink-0 font-semibold text-slate-700">
                                  {primaryKeyword}
                                </span>
                                {secondaryKeywords.length > 0 && (
                                  <span className="min-w-0 truncate text-slate-500">
                                    / {secondaryKeywords.join(" / ")}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="italic text-slate-400">
                                {fallbackText}
                              </span>
                            )}
                          </div>
                          {article.url && (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 text-slate-400 transition-colors hover:text-blue-500 group-hover:text-blue-500"
                              title={path || article.url || title || undefined}
                              aria-label="開啟文章"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-[13px] text-slate-800">
                      {formatNumber(article.impressions)}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-[13px] text-slate-800">
                      {formatNumber(article.clicks)}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-[13px] text-slate-600">
                      {formatRank(article.avgRank)}
                    </td>
                    <td className="px-4 py-3 text-right align-top text-[13px] font-mono text-slate-600">
                      {formatPercent(article.ctr)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
