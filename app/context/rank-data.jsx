"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  aggregateByUrl,
  buildRowsFromResults,
  buildTrafficTimeline,
  dedupeRows,
  fillInteriorGaps,
  isDropFromTopN,
  latestDefinedRank,
  safeDecodeURL,
  safeRank,
  trendDelta,
  MAX_VISIBLE_RANK,
} from "../lib/rank-utils";
import { PROJECTS } from "../lib/project-config";

const RankDataContext = createContext(null);

const firstDefined = (series = []) => {
  for (const value of series) {
    if (value != null) return value;
  }
  return null;
};

const formatDisplayUrl = (input) => {
  const decoded = safeDecodeURL(input);
  if (!decoded || typeof decoded !== "string") return decoded || "";
  try {
    const url = new URL(decoded.includes("http") ? decoded : `https://${decoded.replace(/^\/\//, "")}`);
    const path = url.pathname === "/" ? url.pathname : url.pathname.replace(/\/$/, "");
    return `${path || "/"}${url.search || ""}`;
  } catch {
    return decoded.replace(/^https?:\/\/[^/]+/i, "") || decoded;
  }
};

const ensureAbsoluteUrl = (input, domainFallback) => {
  const decoded = safeDecodeURL(input);
  if (!decoded || typeof decoded !== "string") return null;
  const trimmed = decoded.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^[\w.-]+\.[A-Za-z]{2,}(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }
  if (domainFallback) {
    const host = domainFallback.replace(/^https?:\/\//i, "");
    if (!host) return null;
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `https://${host}${path}`;
  }
  return null;
};

const extractDomain = (input) => {
  const decoded = safeDecodeURL(input);
  if (!decoded || typeof decoded !== "string") return null;
  try {
    const url = new URL(decoded.includes("http") ? decoded : `https://${decoded.replace(/^\/\//, "")}`);
    return url.hostname;
  } catch {
    const match = decoded.match(/^[^/]+/);
    return match ? match[0] : null;
  }
};

export function RankDataProvider({ children }) {
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [windowDays, setWindowDays] = useState(30);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [rows, setRows] = useState([]);
  const [rawResults, setRawResults] = useState([]);
  const [requestedMeta, setRequestedMeta] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceMeta, setSourceMeta] = useState(null);
  const [includeKeywordMetrics, setIncludeKeywordMetrics] = useState(false);
  const [keywordMetricsReady, setKeywordMetricsReady] = useState(false);
  const [pageMetricsRequested, setPageMetricsRequested] = useState(false);
  const [pageTrafficRows, setPageTrafficRows] = useState([]);
  const [pageTrafficLoading, setPageTrafficLoading] = useState(false);
  const [pageTrafficError, setPageTrafficError] = useState("");
  const [pageMetricsMeta, setPageMetricsMeta] = useState(null);

  const activeProject = useMemo(
    () => PROJECTS.find((p) => p.id === projectId) || PROJECTS[0],
    [projectId],
  );
  const fetchDays = Math.max(windowDays * 2, windowDays);
  const isMounted = useRef(false);
  const prevProjectId = useRef(projectId);

  useEffect(() => {
    let aborted = false;
    async function fetchData() {
      try {
        setLoading(true);
        setError("");
        setKeywordMetricsReady(false);
        const params = [
          `file=${encodeURIComponent(activeProject.file)}`,
          `days=${fetchDays}`,
          `site=${encodeURIComponent(activeProject.site)}`,
          `keywordsCol=${activeProject.keywordsCol}`,
          `pageUrlCol=${activeProject.pageUrlCol}`,
          `includeMetrics=${includeKeywordMetrics ? "1" : "0"}`
        ];
        if (forceRefresh) params.push("refresh=1");
        const ts = forceRefresh ? `&_t=${Date.now()}` : "";
        const url = `/api/run-csv/${projectId}?${params.join("&")}${ts}`;
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Upstream ${res.status}: ${txt.slice(0, 200)}`);
        }
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        const built = buildRowsFromResults(results, fetchDays, Array.isArray(json?.requested) ? json.requested : []);
        if (!aborted) {
          setSourceMeta(json?.meta || null);
          setRawResults(results);
          setRows(built);
          setRequestedMeta(Array.isArray(json?.requested) ? json.requested : []);
          setKeywordMetricsReady(includeKeywordMetrics);
        }
      } catch (e) {
        if (!aborted) {
          setError(e?.message || String(e));
          setRawResults([]);
          setRequestedMeta([]);
          setKeywordMetricsReady(false);
        }
      } finally {
        if (!aborted) {
          setLoading(false);
          if (forceRefresh) setForceRefresh(false);
        }
      }
    }
    fetchData();
    return () => {
      aborted = true;
    };
  }, [projectId, activeProject.file, activeProject.site, activeProject.keywordsCol, activeProject.pageUrlCol, windowDays, fetchDays, includeKeywordMetrics, forceRefresh]);

  useEffect(() => {
    if (!pageMetricsRequested && !forceRefresh) {
      return;
    }
    let aborted = false;
    async function fetchPageMetrics() {
      try {
        setPageTrafficLoading(true);
        setPageTrafficError("");
        const params = [
          `site=${encodeURIComponent(activeProject.site)}`,
          `days=${fetchDays}`
        ];
        if (forceRefresh) params.push("refresh=1");
        const ts = forceRefresh ? `&_t=${Date.now()}` : "";
        const url = `/api/page-metrics/${projectId}?${params.join("&")}${ts}`;
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Upstream ${res.status}: ${txt.slice(0, 200)}`);
        }
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        if (!aborted) {
          setPageTrafficRows(results);
          setPageMetricsMeta(json?.meta || null);
        }
      } catch (err) {
        if (!aborted) {
          setPageTrafficError(err?.message || String(err));
          setPageTrafficRows([]);
          setPageMetricsMeta(null);
        }
      } finally {
        if (!aborted) {
          setPageTrafficLoading(false);
        }
      }
    }

    fetchPageMetrics();
    return () => {
      aborted = true;
    };
  }, [pageMetricsRequested, projectId, activeProject.site, fetchDays, forceRefresh]);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      prevProjectId.current = projectId;
      return;
    }
    if (prevProjectId.current !== projectId) {
      setRows([]);
      setRawResults([]);
      setSourceMeta(null);
      setRequestedMeta([]);
      setKeywordMetricsReady(false);
      setPageTrafficRows([]);
      setPageMetricsMeta(null);
      setPageTrafficError("");
      prevProjectId.current = projectId;
    }
  }, [projectId]);

  const baseAll = useMemo(() => dedupeRows(rows), [rows]);
  const totalUrls = useMemo(() => new Set(baseAll.map((r) => r.displayUrl)).size, [baseAll]);
  const totalKeywords = baseAll.length;
  const primaryDomain = useMemo(() => {
    for (const row of baseAll) {
      const domain = extractDomain(row?.displayUrl);
      if (domain) return domain;
    }
    return null;
  }, [baseAll]);

  const groupedBase = useMemo(() => aggregateByUrl(baseAll, windowDays), [baseAll, windowDays]);

  const { timelineCurrent, timelinePrevious } = useMemo(() => {
    if (!baseAll.length) return { timelineCurrent: [], timelinePrevious: [] };
    const historyLengths = baseAll.map((row) => (Array.isArray(row.history) ? row.history.length : 0));
    const maxHistory = Math.max(0, ...historyLengths);
    const totalLen = Math.min(maxHistory, windowDays * 2);
    if (!totalLen) return { timelineCurrent: [], timelinePrevious: [] };

    const today = new Date();
    const baseUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const anchorUTC = baseUTC - 24 * 60 * 60 * 1000;

    const timelineAll = Array.from({ length: totalLen }, (_, idx) => {
      const day = new Date(anchorUTC);
      day.setUTCDate(day.getUTCDate() - (totalLen - 1 - idx));

      let sum = 0;
      let count = 0;
      let top10 = 0;
      let top20 = 0;

      baseAll.forEach((row) => {
        const hist = Array.isArray(row.history) ? row.history : [];
        if (!hist.length) return;
        const offset = Math.max(0, hist.length - totalLen);
        const val = hist[idx + offset];
        if (val == null) return;
        const clamped = Math.max(1, Math.min(MAX_VISIBLE_RANK, Math.round(val)));
        sum += clamped;
        count += 1;
        if (clamped <= 10) top10 += 1;
        if (clamped <= 20) top20 += 1;
      });

      const month = String(day.getUTCMonth() + 1).padStart(2, "0");
      const date = String(day.getUTCDate()).padStart(2, "0");

      return {
        date: `${month}/${date}`,
        fullDate: `${day.getUTCFullYear()}-${month}-${date}`,
        avgRank: count ? sum / count : null,
        top10Share: totalKeywords ? top10 / totalKeywords : 0,
        top20Share: totalKeywords ? top20 / totalKeywords : 0,
        sampleSize: count,
      };
    });

    const current = timelineAll.slice(-windowDays);
    const previousStart = Math.max(0, timelineAll.length - windowDays * 2);
    const previousEnd = Math.max(0, timelineAll.length - windowDays);
    const previous = previousEnd > previousStart ? timelineAll.slice(previousStart, previousEnd) : [];

    return { timelineCurrent: current, timelinePrevious: previous };
  }, [baseAll, windowDays, totalKeywords]);

  const timeline = timelineCurrent;

  const hasPreviousWindow = timelinePrevious.length === windowDays;
  const trafficSource = pageTrafficRows.length ? pageTrafficRows : rawResults;
  const trafficTimelineFull = useMemo(() => buildTrafficTimeline(trafficSource, fetchDays), [trafficSource, fetchDays]);
  const trafficTimeline = useMemo(
    () => trafficTimelineFull.slice(-windowDays),
    [trafficTimelineFull, windowDays],
  );
  const trafficTimelinePrevious = useMemo(() => {
    const start = Math.max(0, trafficTimelineFull.length - windowDays * 2);
    const end = Math.max(0, trafficTimelineFull.length - windowDays);
    return end > start ? trafficTimelineFull.slice(start, end) : [];
  }, [trafficTimelineFull, windowDays]);

  const top10TrendSeries = useMemo(
    () => timeline.map((d) => (d.top10Share != null ? Number((d.top10Share * 100).toFixed(1)) : null)),
    [timeline],
  );

  const top20TrendSeries = useMemo(
    () => timeline.map((d) => (d.top20Share != null ? Number((d.top20Share * 100).toFixed(1)) : null)),
    [timeline],
  );

  const impressionsTrendSeries = useMemo(
    () => trafficTimeline.map((d) => (d.impressions != null ? Number(Math.round(d.impressions)) : null)),
    [trafficTimeline],
  );

  const clicksTrendSeries = useMemo(
    () => trafficTimeline.map((d) => (d.clicks != null ? Number(Math.round(d.clicks)) : null)),
    [trafficTimeline],
  );

  const keywordMovementTrend = useMemo(() => {
    if (!baseAll.length) return []; 
    const len = windowDays;
    const deltas = Array.from({ length: len }, () => ({ improving: 0, declining: 0 }));
    baseAll.forEach((row) => {
      const histRaw = Array.isArray(row.history) ? row.history : [];
      if (!histRaw.length) return;
      const offset = Math.max(0, histRaw.length - len);
      for (let idx = 1; idx < len; idx++) {
        const prevIdx = idx + offset - 1;
        const currIdx = idx + offset;
        if (prevIdx < 0 || prevIdx >= histRaw.length) continue;
        if (currIdx < 0 || currIdx >= histRaw.length) continue;
        const prev = histRaw[prevIdx];
        const curr = histRaw[currIdx];
        if (prev == null || curr == null) continue;
        if (curr < prev) deltas[idx].improving += 1;
        else if (curr > prev) deltas[idx].declining += 1;
      }
    });
    return deltas.map(({ improving, declining }) => improving - declining);
  }, [baseAll, windowDays]);

  const trendSeries = useMemo(() => {
    if (!timeline.length) return [];
    const raw = timeline.map((d) => {
      if (d.avgRank == null) return null;
      const clamped = Math.max(1, Math.min(MAX_VISIBLE_RANK, Math.round(d.avgRank)));
      return clamped;
    });
    return fillInteriorGaps(raw);
  }, [timeline]);

  const keywordSummary = useMemo(() => {
    let improving = 0;
    let declining = 0;
    let steady = 0;
    let dropTop10 = 0;
    let currentTop10 = 0;
    let currentTop20 = 0;
    groupedBase.forEach((group) => {
      group.items.forEach((it) => {
        if (it.delta > 0) improving += 1;
        else if (it.delta < 0) declining += 1;
        else steady += 1;
        if (it.end != null && it.end <= 10) currentTop10 += 1;
        if (it.end != null && it.end <= 20) currentTop20 += 1;
        if (isDropFromTopN(it.start, it.end, 10)) dropTop10 += 1;
      });
    });
    return {
      improving,
      declining,
      steady,
      dropTop10,
      currentTop10,
      currentTop20,
    };
  }, [groupedBase]);

  const crossWindowMovement = useMemo(() => {
    let improving = 0;
    let declining = 0;
    let improvingPrev = 0;
    let decliningPrev = 0;
    if (!hasPreviousWindow) {
      return { improving, declining, improvingPrev, decliningPrev };
    }
    baseAll.forEach((row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      if (!hist.length) return;
      const len = hist.length;
      const currentSlice = hist.slice(Math.max(0, len - windowDays));
      const prevSlice = hist.slice(Math.max(0, len - windowDays * 2), Math.max(0, len - windowDays));
      if (!prevSlice.length) return;
      const currentRank = latestDefinedRank(currentSlice);
      const prevRank = latestDefinedRank(prevSlice);
      if (currentRank == null || prevRank == null) return;
      const currValue = safeRank(currentRank);
      const prevValue = safeRank(prevRank);
      if (currValue > prevValue) declining += 1;
      else if (currValue < prevValue) improving += 1;

      const prevPrevSlice = hist.slice(Math.max(0, len - windowDays * 3), Math.max(0, len - windowDays * 2));
      const prevPrevRank = latestDefinedRank(prevPrevSlice);
      if (prevPrevSlice.length && prevPrevRank != null) {
        const prevPrevValue = safeRank(prevPrevRank);
        if (prevValue > prevPrevValue) decliningPrev += 1;
        else if (prevValue < prevPrevValue) improvingPrev += 1;
      }
    });
    return { improving, declining, improvingPrev, decliningPrev };
  }, [baseAll, windowDays, hasPreviousWindow]);

  const avgRankCurrent = useMemo(() => {
    if (!baseAll.length) return null;
    const total = baseAll.reduce((acc, row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      const slice = hist.slice(Math.max(0, hist.length - windowDays));
      const latest = latestDefinedRank(slice);
      return acc + safeRank(latest != null ? Math.round(latest) : null);
    }, 0);
    return total / baseAll.length;
  }, [baseAll, windowDays]);

  const avgRankPrevious = useMemo(() => {
    if (!hasPreviousWindow || !baseAll.length) return null;
    let count = 0;
    const total = baseAll.reduce((acc, row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      if (hist.length < windowDays * 2) {
        count += 1;
        return acc + safeRank(null);
      }
      const start = hist.length - windowDays * 2;
      const end = hist.length - windowDays;
      const slice = hist.slice(start, end);
      const latest = latestDefinedRank(slice);
      count += 1;
      return acc + safeRank(latest != null ? Math.round(latest) : null);
    }, 0);
    return count ? total / count : null;
  }, [baseAll, windowDays, hasPreviousWindow]);

  const avgRankDelta = avgRankCurrent != null && avgRankPrevious != null ? avgRankPrevious - avgRankCurrent : null;

  const impressionsCurrentTotal = useMemo(
    () => trafficTimeline.reduce((acc, d) => acc + (Number.isFinite(d.impressions) ? d.impressions : 0), 0),
    [trafficTimeline],
  );

  const impressionsPreviousTotal = useMemo(
    () => trafficTimelinePrevious.reduce((acc, d) => acc + (Number.isFinite(d.impressions) ? d.impressions : 0), 0),
    [trafficTimelinePrevious],
  );

  const clicksCurrentTotal = useMemo(
    () => trafficTimeline.reduce((acc, d) => acc + (Number.isFinite(d.clicks) ? d.clicks : 0), 0),
    [trafficTimeline],
  );

  const clicksPreviousTotal = useMemo(
    () => trafficTimelinePrevious.reduce((acc, d) => acc + (Number.isFinite(d.clicks) ? d.clicks : 0), 0),
    [trafficTimelinePrevious],
  );

  const hasPreviousTraffic = trafficTimelinePrevious.length === windowDays;

  const impressionsDelta = hasPreviousTraffic ? impressionsCurrentTotal - impressionsPreviousTotal : null;
  const clicksDelta = hasPreviousTraffic ? clicksCurrentTotal - clicksPreviousTotal : null;

  const comparisonHelper = hasPreviousWindow ? `vs 前一${windowDays}天` : null;

  const ctrCurrent = impressionsCurrentTotal > 0 ? clicksCurrentTotal / impressionsCurrentTotal : null;
  const ctrPrevious = hasPreviousTraffic && impressionsPreviousTotal > 0 ? clicksPreviousTotal / impressionsPreviousTotal : null;
  const ctrDelta = ctrCurrent != null && ctrPrevious != null ? ctrCurrent - ctrPrevious : null;

  const keywordsWithRankCurrent = useMemo(() => {
    if (!baseAll.length) return 0;
    let count = 0;
    baseAll.forEach((row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      if (!hist.length) return;
      const segment = hist.slice(-windowDays);
      if (segment.some((v) => v != null)) count += 1;
    });
    return count;
  }, [baseAll, windowDays]);

  const keywordsWithRankPrevious = useMemo(() => {
    if (!hasPreviousWindow || !baseAll.length) return null;
    let count = 0;
    baseAll.forEach((row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      if (hist.length < windowDays * 2) return;
      const start = hist.length - windowDays * 2;
      const end = hist.length - windowDays;
      const segment = hist.slice(start, end);
      if (segment.some((v) => v != null)) count += 1;
    });
    return count;
  }, [baseAll, windowDays, hasPreviousWindow]);

  const keywordsWithRankDelta =
    keywordsWithRankPrevious != null ? keywordsWithRankCurrent - keywordsWithRankPrevious : null;

  const normalizeQueryKey = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");

  const queryMetaMap = useMemo(() => {
    const map = new Map();
    requestedMeta.forEach((item) => {
      const raw = item?.query;
      if (!raw) return;
      const key = normalizeQueryKey(raw);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          query: raw,
          tag: item?.tag || null,
          volume: Number.isFinite(Number(item?.volume)) ? Number(item.volume) : null,
          page: item?.page ? safeDecodeURL(item.page) : null,
        });
      }
    });
    return map;
  }, [requestedMeta]);

const currentDateSet = useMemo(() => {
  const set = new Set();
  timeline.forEach((d) => {
    if (d?.fullDate) set.add(d.fullDate);
  });
  return set;
}, [timeline]);

const previousDateSet = useMemo(() => {
  const set = new Set();
  timelinePrevious.forEach((d) => {
    if (d?.fullDate) set.add(d.fullDate);
  });
  return set;
}, [timelinePrevious]);

const currentIndexMap = useMemo(() => {
  const map = new Map();
  timeline.forEach((d, idx) => {
    if (d?.fullDate) map.set(d.fullDate, idx);
  });
  return map;
}, [timeline]);

const previousIndexMap = useMemo(() => {
  const map = new Map();
  timelinePrevious.forEach((d, idx) => {
    if (d?.fullDate) map.set(d.fullDate, idx);
  });
  return map;
}, [timelinePrevious]);

const keywordAggregates = useMemo(() => {
  const current = new Map();
  const previous = new Map();
  const names = new Map();
  const currentSeries = new Map();
  const previousSeries = new Map();
  const pageMap = new Map();
  const currentLen = timeline.length;
  const previousLen = timelinePrevious.length;

  const ensureSeries = (collection, key, length) => {
    if (!collection.has(key)) collection.set(key, Array.from({ length }, () => 0));
    return collection.get(key);
  };

  rawResults.forEach((row) => {
    if (!row) return;
    const dateVal = row?.["CAST(date AS DATE)"] || row?.date || row?.dt;
    const queryStr = row?.query;
    if (!dateVal || !queryStr) return;
    const dateObj = new Date(dateVal);
    if (Number.isNaN(dateObj.getTime())) return;
    const label = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dateObj.getUTCDate()).padStart(2, "0")}`;
    const key = normalizeQueryKey(queryStr);
    if (!key) return;
    const impressions = Number(row?.impressions ?? row?.total_impressions ?? row?.sum_impressions ?? row?.impr);
    const clicks = Number(row?.clicks ?? row?.total_clicks ?? row?.sum_clicks ?? row?.click);
    const currentIdx = currentIndexMap.get(label);
    const previousIdx = previousIndexMap.get(label);
    let totalsMap;
    let seriesMap;
    let index;
    let length;
    if (currentIdx != null) {
      totalsMap = current;
      seriesMap = currentSeries;
      index = currentIdx;
      length = currentLen;
    } else if (previousIdx != null) {
      totalsMap = previous;
      seriesMap = previousSeries;
      index = previousIdx;
      length = previousLen;
    } else {
      return;
    }
    if (!totalsMap.has(key)) totalsMap.set(key, { impressions: 0, clicks: 0 });
    const totals = totalsMap.get(key);
    if (Number.isFinite(impressions)) totals.impressions += impressions;
    if (Number.isFinite(clicks)) totals.clicks += clicks;
    if (length > 0 && Number.isFinite(impressions)) {
      const series = ensureSeries(seriesMap, key, length);
      series[index] += impressions;
    }
    if (!names.has(key)) names.set(key, queryStr);
    if (!pageMap.has(key)) {
      const rawPage = row?.page || row?.page_url || row?.displayUrl || row?.url;
      if (rawPage) pageMap.set(key, safeDecodeURL(rawPage));
    }
  });

  return { current, previous, names, currentSeries, previousSeries, pageMap };
}, [rawResults, currentIndexMap, previousIndexMap, timeline.length, timelinePrevious.length]);

const pageTrafficAggregates = useMemo(() => {
  const current = new Map();
  const previous = new Map();
  const source = pageTrafficRows.length ? pageTrafficRows : rawResults;

  source.forEach((row) => {
    if (!row) return;
    const dateVal = row?.["CAST(date AS DATE)"] || row?.date || row?.dt;
    if (!dateVal) return;
    const dateObj = new Date(dateVal);
    if (Number.isNaN(dateObj.getTime())) return;
    const label = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dateObj.getUTCDate()).padStart(2, "0")}`;
    const clicks = Number(row?.clicks ?? row?.total_clicks ?? row?.sum_clicks ?? row?.click);
    if (!Number.isFinite(clicks) || clicks === 0) return;
    const urlRaw = row?.page || row?.page_url || row?.displayUrl || row?.url;
    if (!urlRaw) return;
    const decoded = safeDecodeURL(urlRaw);
    if (currentDateSet.has(label)) {
      current.set(decoded, (current.get(decoded) || 0) + clicks);
    } else if (previousDateSet.has(label)) {
      previous.set(decoded, (previous.get(decoded) || 0) + clicks);
    }
  });

  return { current, previous };
}, [pageTrafficRows, rawResults, currentDateSet, previousDateSet]);

const keywordSearchRows = useMemo(() => {
  const keys = new Set([
    ...keywordAggregates.current.keys(),
    ...keywordAggregates.previous.keys(),
  ]);
  return Array.from(keys)
    .map((key) => {
      const current = keywordAggregates.current.get(key) || { impressions: 0, clicks: 0 };
      const previous = keywordAggregates.previous.get(key) || { impressions: 0, clicks: 0 };
      const meta = queryMetaMap.get(key) || {};
      const label = meta.query || keywordAggregates.names.get(key) || "";
      const seriesCurrent = keywordAggregates.currentSeries.get(key) || [];
      const seriesPrevious = keywordAggregates.previousSeries.get(key) || [];
      const pageSource = meta.page || keywordAggregates.pageMap.get(key) || null;
      return {
        query: label,
        tag: meta.tag || null,
        volume: meta.volume ?? null,
        impressions: current.impressions,
        clicks: current.clicks,
        impressionsPrev: previous.impressions,
        clicksPrev: previous.clicks,
        impressionsDelta: current.impressions - previous.impressions,
        clicksDelta: current.clicks - previous.clicks,
        seriesCurrent: seriesCurrent.slice(),
        seriesPrevious: seriesPrevious.slice(),
        page: pageSource,
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
}, [keywordAggregates, queryMetaMap]);

const keywordSearchMap = useMemo(() => {
  const map = new Map();
  keywordSearchRows.forEach((row) => {
    const key = normalizeQueryKey(row.query);
    if (key) map.set(key, row);
  });
  return map;
}, [keywordSearchRows]);

const keywordMissingRows = useMemo(() => {
  if (!requestedMeta.length) return [];
  const rows = [];
  requestedMeta.forEach((meta) => {
    const key = normalizeQueryKey(meta?.query);
    if (!key || keywordSearchMap.has(key)) return;
    const volume = Number(meta?.volume);
    rows.push({
      query: meta?.query || "",
      tag: meta?.tag || null,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  });
  rows.sort((a, b) => b.volume - a.volume);
  return rows;
}, [requestedMeta, keywordSearchMap]);

const tagSearchSummary = useMemo(() => {
  if (!keywordSearchRows.length) return [];
  const totals = new Map();
  const seriesCurrent = new Map();
  const seriesPrevious = new Map();
  keywordSearchRows.forEach((row) => {
    const tag = row.tag || "未分類";
    if (!totals.has(tag)) {
      totals.set(tag, { tag, impressions: 0, impressionsPrev: 0 });
    }
    const agg = totals.get(tag);
    agg.impressions += row.impressions;
    agg.impressionsPrev += row.impressionsPrev || 0;

    if (Array.isArray(row.seriesCurrent) && row.seriesCurrent.length) {
      const arr = seriesCurrent.get(tag) || Array.from({ length: row.seriesCurrent.length }, () => 0);
      row.seriesCurrent.forEach((value, idx) => {
        arr[idx] += value;
      });
      seriesCurrent.set(tag, arr);
    }

    if (Array.isArray(row.seriesPrevious) && row.seriesPrevious.length) {
      const arrPrev = seriesPrevious.get(tag) || Array.from({ length: row.seriesPrevious.length }, () => 0);
      row.seriesPrevious.forEach((value, idx) => {
        arrPrev[idx] += value;
      });
      seriesPrevious.set(tag, arrPrev);
    }
  });
  return Array.from(totals.values())
    .map((row) => ({
      ...row,
      impressionsDelta: row.impressions - row.impressionsPrev,
      seriesCurrent: seriesCurrent.get(row.tag) || [],
      seriesPrevious: seriesPrevious.get(row.tag) || [],
    }))
    .sort((a, b) => b.impressions - a.impressions);
}, [keywordSearchRows]);

const pageMovers = useMemo(() => {
  const urls = new Set([
    ...pageTrafficAggregates.current.keys(),
    ...pageTrafficAggregates.previous.keys(),
  ]);
  if (!urls.size) return { up: [], down: [] };

  const entries = Array.from(urls)
    .map((url) => {
      const currentClicks = pageTrafficAggregates.current.get(url) || 0;
      const previousClicks = pageTrafficAggregates.previous.get(url) || 0;
      const delta = currentClicks - previousClicks;
      if (!delta) return null;
      const label = formatDisplayUrl(url) || url;
      const href = url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url.replace(/^\/+/, "")}`;
      return {
        type: "page",
        label,
        href,
        current: currentClicks,
        previous: previousClicks,
        delta,
      };
    })
    .filter(Boolean);

  const up = entries
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.current - a.current)
    .slice(0, 5);
  const down = entries
    .filter((item) => item.delta < 0)
    .sort((a, b) => a.delta - b.delta || b.current - a.current)
    .slice(0, 5);
  return { up, down };
}, [pageTrafficAggregates]);

const queryMovers = useMemo(() => {
  if (!keywordSearchRows.length) return { up: [], down: [] };

  const entries = keywordSearchRows
    .map((row) => {
      const delta = Number(row.clicksDelta ?? row.impressionsDelta ?? 0);
      if (!delta) return null;
      const queryText = row.query || "";
      const href = row.page ? ensureAbsoluteUrl(row.page, primaryDomain) : null;
      return {
        type: "query",
        label: queryText || "(未命名)",
        href,
        current: Number(row.clicks) || 0,
        previous: Number(row.clicksPrev) || 0,
        delta,
      };
    })
    .filter(Boolean);

  const up = entries
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.current - a.current)
    .slice(0, 5);

  const down = entries
    .filter((item) => item.delta < 0)
    .sort((a, b) => a.delta - b.delta || b.current - a.current)
    .slice(0, 5);

  return { up, down };
}, [keywordSearchRows, primaryDomain]);

  const top10CurrentCount = useMemo(() => {
    if (!baseAll.length) return 0;
    let count = 0;
    baseAll.forEach((row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      const slice = hist.slice(Math.max(0, hist.length - windowDays));
      const latest = latestDefinedRank(slice);
      if (latest != null && latest <= 10) count += 1;
    });
    return count;
  }, [baseAll, windowDays]);

  const top10PreviousCount = useMemo(() => {
    if (!hasPreviousWindow || !baseAll.length) return null;
    let count = 0;
    baseAll.forEach((row) => {
      const hist = Array.isArray(row.history) ? row.history : [];
      if (hist.length < windowDays * 2) return;
      const slice = hist.slice(Math.max(0, hist.length - windowDays * 2), Math.max(0, hist.length - windowDays));
      const latest = latestDefinedRank(slice);
      if (latest != null && latest <= 10) count += 1;
    });
    return count;
  }, [baseAll, windowDays, hasPreviousWindow]);

  const top10Share = totalKeywords ? top10CurrentCount / totalKeywords : null;
  const top10SharePrevious = totalKeywords && top10PreviousCount != null ? top10PreviousCount / totalKeywords : null;
  const dropShare = totalKeywords ? keywordSummary.dropTop10 / totalKeywords : null;

  const overviewData = useMemo(() => ({
    totalUrls,
    totalKeywords,
    avgRankCurrent,
    avgRankDelta,
    improvingKeywords: keywordSummary.improving,
    decliningKeywords: keywordSummary.declining,
    improvingUnique: crossWindowMovement.improving,
    decliningUnique: crossWindowMovement.declining,
    dropTop10: keywordSummary.dropTop10,
    currentTop10: top10CurrentCount,
    currentTop20: keywordSummary.currentTop20,
    top10Share,
    top10SharePrevious,
    top10PreviousCount,
    dropShare,
    timeline,
    trendSeries,
    top10TrendSeries,
    top20TrendSeries,
    impressionsTrendSeries,
    clicksTrendSeries,
    keywordMovementTrend,
    impressionsCurrent: impressionsCurrentTotal,
    impressionsPrevious: hasPreviousTraffic ? impressionsPreviousTotal : null,
    impressionsDelta,
    clicksCurrent: clicksCurrentTotal,
    clicksPrevious: hasPreviousTraffic ? clicksPreviousTotal : null,
    clicksDelta,
    ctrCurrent,
    ctrPrevious,
    ctrDelta,
    trafficTimeline,
    comparisonHelper,
    windowDays,
    keywordSearchRows,
    tagSearchSummary,
    keywordMissingRows,
    keywordsWithRankCurrent,
    keywordsWithRankPrevious,
    keywordsWithRankDelta,
    primaryDomain,
    pageMoversUp: pageMovers.up,
    pageMoversDown: pageMovers.down,
    queryMoversUp: queryMovers.up,
    queryMoversDown: queryMovers.down,
    decliningUniquePrev: crossWindowMovement.decliningPrev,
  }), [
    totalUrls,
    totalKeywords,
    avgRankCurrent,
    avgRankDelta,
    keywordSummary,
    top10Share,
    top10SharePrevious,
    top10CurrentCount,
    top10PreviousCount,
    dropShare,
    timeline,
    trendSeries,
    top10TrendSeries,
    top20TrendSeries,
    impressionsTrendSeries,
    clicksTrendSeries,
    keywordMovementTrend,
    impressionsCurrentTotal,
    impressionsPreviousTotal,
    impressionsDelta,
    clicksCurrentTotal,
    clicksPreviousTotal,
    clicksDelta,
    ctrCurrent,
    ctrPrevious,
    ctrDelta,
    trafficTimeline,
    comparisonHelper,
    windowDays,
    keywordSearchRows,
    tagSearchSummary,
    keywordMissingRows,
    keywordsWithRankCurrent,
    keywordsWithRankPrevious,
    keywordsWithRankDelta,
    primaryDomain,
    pageMovers,
    queryMovers,
    crossWindowMovement,
  ]);

  const ensureOverviewMetrics = useCallback(() => {
    setPageMetricsRequested(true);
    setIncludeKeywordMetrics(true);
  }, []);

  const pageMetricsReady = pageTrafficRows.length > 0;

  const value = useMemo(() => ({
    projects: PROJECTS,
    projectId,
    setProjectId,
    windowDays,
    setWindowDays,
    triggerRefresh: () => setForceRefresh(true),
    loading,
    error,
    sourceMeta,
    groupedBase,
    totalUrls,
    totalKeywords,
    overviewData,
    activeProject,
    requestedMeta,
    ensureOverviewMetrics,
    keywordMetricsReady,
    includeKeywordMetrics,
    pageMetricsReady,
    pageMetricsRequested,
    pageTrafficLoading,
    pageTrafficError,
    pageMetricsMeta,
  }), [
    projectId,
    windowDays,
    loading,
    error,
    sourceMeta,
    groupedBase,
    totalUrls,
    totalKeywords,
    overviewData,
    activeProject,
    requestedMeta,
    ensureOverviewMetrics,
    keywordMetricsReady,
    includeKeywordMetrics,
    pageMetricsReady,
    pageMetricsRequested,
    pageTrafficLoading,
    pageTrafficError,
    pageMetricsMeta,
  ]);

  return (
    <RankDataContext.Provider value={value}>
      {children}
    </RankDataContext.Provider>
  );
}

export function useRankData() {
  const ctx = useContext(RankDataContext);
  if (!ctx) throw new Error("useRankData must be used within RankDataProvider");
  return ctx;
}
