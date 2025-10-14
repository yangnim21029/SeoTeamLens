"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  MAX_VISIBLE_RANK
} from "../lib/rank-utils";

const RankDataContext = createContext(null);
const LAST_PROJECT_STORAGE_KEY = "ranklens:last-project-id";

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
    const url = new URL(
      decoded.includes("http")
        ? decoded
        : `https://${decoded.replace(/^\/\//, "")}`,
    );
    const path =
      url.pathname === "/" ? url.pathname : url.pathname.replace(/\/$/, "");
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
    const url = new URL(
      decoded.includes("http")
        ? decoded
        : `https://${decoded.replace(/^\/\//, "")}`,
    );
    return url.hostname;
  } catch {
    const match = decoded.match(/^[^/]+/);
    return match ? match[0] : null;
  }
};

export function RankDataProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
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
  const [projectRowsFull, setProjectRowsFull] = useState([]);

  const projectIdRef = useRef("");
  const projectsLoadedRef = useRef(false);
  const initialProjectIdRef = useRef("");

  const activeProject = useMemo(() => {
    if (!projects.length) return null;
    return projects.find((p) => p.id === projectId) || null;
  }, [projects, projectId]);
  const fetchDays = Math.max(windowDays * 2, windowDays);
  const isMounted = useRef(false);
  const prevProjectId = useRef(projectId);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    // 預設不載入任何儲存的項目，讓用戶主動選擇
    if (typeof window === "undefined") return;
    // 移除自動載入邏輯，讓下拉選單預設為空
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (projectId) {
      window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
    } else {
      window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectsLoadedRef.current) return;
    projectsLoadedRef.current = true;
    let aborted = false;

    async function loadProjects() {
      try {
        const res = await fetch("/api/data/projects", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to fetch projects: ${res.status}`);
        }
        const payload = await res.json();
        const rawList = Array.isArray(payload?.projects)
          ? payload.projects
          : Array.isArray(payload)
            ? payload
            : [];
        if (!rawList.length) {
          if (!aborted) {
            setProjects([]);
            setProjectId("");
            projectIdRef.current = "";
            setError("No projects found in database.");
          }
          return;
        }

        const normalized = rawList
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const rawId = typeof item.id === "string" ? item.id.trim() : "";
            if (!rawId) return null;
            const label =
              typeof item.label === "string" && item.label.trim()
                ? item.label.trim()
                : rawId;
            const rowCount = Number.isFinite(Number(item.rowCount))
              ? Number(item.rowCount)
              : 0;
            const lastUpdated =
              typeof item.lastUpdated === "string" && item.lastUpdated.trim()
                ? item.lastUpdated.trim()
                : null;
            return {
              id: rawId,
              label,
              rowCount,
              lastUpdated,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

        if (aborted) return;
        if (!normalized.length) {
          setProjects([]);
          setProjectId("");
          projectIdRef.current = "";
          setError("No projects found in database.");
          return;
        }

        setError("");
        setProjects(normalized);
        // 預設不選擇任何項目，讓用戶主動選擇
        projectIdRef.current = "";
        setProjectId("");
        initialProjectIdRef.current = "";
      } catch (err) {
        console.error("Failed to load projects from database:", err);
        if (!aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setProjects([]);
          setProjectId("");
          projectIdRef.current = "";
        }
      }
    }

    loadProjects();

    return () => {
      aborted = true;
    };
  }, [setProjectId]);

  useEffect(() => {
    if (!projectId) {
      setRows([]);
      setRawResults([]);
      setRequestedMeta([]);
      setSourceMeta(null);
      setKeywordMetricsReady(false);
      setPageTrafficRows([]);
      setPageMetricsMeta(null);
      setPageTrafficError("");
      setProjectRowsFull([]);
      return;
    }
    let aborted = false;
    async function fetchAllData() {
      try {
        setLoading(true);
        setPageTrafficLoading(true);
        setError("");
        setPageTrafficError("");
        setKeywordMetricsReady(false);
        
        const ts = forceRefresh ? `&_t=${Date.now()}` : "";
        
        // 準備兩個 API 的參數
        const runCsvParams = [`days=${fetchDays}`, `includeMetrics=${includeKeywordMetrics ? "1" : "0"}`];
        if (forceRefresh) runCsvParams.push("refresh=1");
        const runCsvUrl = `/api/run-csv/${projectId}?${runCsvParams.join("&")}${ts}`;
        
        const pageMetricsParams = [`days=${fetchDays}`];
        if (forceRefresh) pageMetricsParams.push("refresh=1");
        const pageMetricsUrl = `/api/page-metrics/${projectId}?${pageMetricsParams.join("&")}${ts}`;
        
        // 並行調用兩個 API
        const projectDataUrl = `/api/data/${projectId}${ts}`;
        const [runCsvResponse, pageMetricsResponse, projectDataResponse] = await Promise.all([
          fetch(runCsvUrl, { method: "GET", cache: "no-store" }),
          pageMetricsRequested || forceRefresh
            ? fetch(pageMetricsUrl, { method: "GET", cache: "no-store" })
            : Promise.resolve(null),
          fetch(projectDataUrl, { method: "GET", cache: "no-store" }).catch(
            (err) => {
              console.error("Failed to fetch project detail:", err);
              return null;
            },
          ),
        ]);
        
        // 處理 run-csv API 回應
        if (!runCsvResponse.ok) {
          const txt = await runCsvResponse.text().catch(() => "");
          throw new Error(`Run-CSV API ${runCsvResponse.status}: ${txt.slice(0, 200)}`);
        }
        const runCsvJson = await runCsvResponse.json();
        const results = Array.isArray(runCsvJson?.results) ? runCsvJson.results : [];
        const built = buildRowsFromResults(
          results,
          fetchDays,
          Array.isArray(runCsvJson?.requested) ? runCsvJson.requested : [],
        );
        
        // 處理 page-metrics API 回應
        let pageMetricsResults = [];
        let pageMetricsMeta = null;
        let pageMetricsError = "";
        
        if (pageMetricsResponse) {
          if (!pageMetricsResponse.ok) {
            const txt = await pageMetricsResponse.text().catch(() => "");
            pageMetricsError = `Page-Metrics API ${pageMetricsResponse.status}: ${txt.slice(0, 200)}`;
          } else {
            const pageMetricsJson = await pageMetricsResponse.json();
            pageMetricsResults = Array.isArray(pageMetricsJson?.results) ? pageMetricsJson.results : [];
            pageMetricsMeta = pageMetricsJson?.meta || null;
          }
        }
        
        if (!aborted) {
          // 設定 run-csv 資料
          setSourceMeta(runCsvJson?.meta || null);
          setRawResults(results);
          setRows(built);
          setRequestedMeta(
            Array.isArray(runCsvJson?.requested) ? runCsvJson.requested : [],
          );
          setKeywordMetricsReady(includeKeywordMetrics);

          // 設定 page-metrics 資料
          setPageTrafficRows(pageMetricsResults);
          setPageMetricsMeta(pageMetricsMeta);
          setPageTrafficError(pageMetricsError);

          if (projectDataResponse && projectDataResponse.ok) {
            try {
              const projectJson = await projectDataResponse.json();
              setProjectRowsFull(
                Array.isArray(projectJson?.rows)
                  ? projectJson.rows.filter(
                      (row) => row && typeof row === "object",
                    )
                  : [],
              );
            } catch (error) {
              console.error("Failed to parse project detail response:", error);
              setProjectRowsFull([]);
            }
          } else {
            setProjectRowsFull([]);
          }
        }
      } catch (e) {
        if (!aborted) {
          setError(e?.message || String(e));
          setRawResults([]);
          setRequestedMeta([]);
          setKeywordMetricsReady(false);
          setPageTrafficRows([]);
          setPageMetricsMeta(null);
          setProjectRowsFull([]);
        }
      } finally {
        if (!aborted) {
          setLoading(false);
          setPageTrafficLoading(false);
          if (forceRefresh) setForceRefresh(false);
        }
      }
    }
    fetchAllData();
    return () => {
      aborted = true;
    };
  }, [
    projectId,
    windowDays,
    fetchDays,
    includeKeywordMetrics,
    forceRefresh,
    pageMetricsRequested,
  ]);

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
      setProjectRowsFull([]);
      prevProjectId.current = projectId;
    }
  }, [projectId]);

  const baseAll = useMemo(() => dedupeRows(rows), [rows]);
  const totalUrls = useMemo(
    () => new Set(baseAll.map((r) => r.displayUrl)).size,
    [baseAll],
  );
  const totalKeywords = baseAll.length;
  const primaryDomain = useMemo(() => {
    for (const row of baseAll) {
      const domain = extractDomain(row?.displayUrl);
      if (domain) return domain;
    }
    return null;
  }, [baseAll]);

  const groupedBase = useMemo(
    () => aggregateByUrl(baseAll, windowDays),
    [baseAll, windowDays],
  );

  const { timelineCurrent, timelinePrevious } = useMemo(() => {
    if (!baseAll.length) return { timelineCurrent: [], timelinePrevious: [] };
    const historyLengths = baseAll.map((row) =>
      Array.isArray(row.history) ? row.history.length : 0,
    );
    const maxHistory = Math.max(0, ...historyLengths);
    const totalLen = Math.min(maxHistory, windowDays * 2);
    if (!totalLen) return { timelineCurrent: [], timelinePrevious: [] };

    const today = new Date();
    const baseUTC = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
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
        const clamped = Math.max(
          1,
          Math.min(MAX_VISIBLE_RANK, Math.round(val)),
        );
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
    const previous =
      previousEnd > previousStart
        ? timelineAll.slice(previousStart, previousEnd)
        : [];

    return { timelineCurrent: current, timelinePrevious: previous };
  }, [baseAll, windowDays, totalKeywords]);

  const timeline = timelineCurrent;

  const hasPreviousWindow = timelinePrevious.length === windowDays;
  const trafficSource = pageTrafficRows.length ? pageTrafficRows : rawResults;
  const trafficTimelineFull = useMemo(
    () => buildTrafficTimeline(trafficSource, fetchDays),
    [trafficSource, fetchDays],
  );
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
    () =>
      timeline.map((d) =>
        d.top10Share != null ? Number((d.top10Share * 100).toFixed(1)) : null,
      ),
    [timeline],
  );

  const top20TrendSeries = useMemo(
    () =>
      timeline.map((d) =>
        d.top20Share != null ? Number((d.top20Share * 100).toFixed(1)) : null,
      ),
    [timeline],
  );

  const impressionsTrendSeries = useMemo(
    () =>
      trafficTimeline.map((d) =>
        d.impressions != null ? Number(Math.round(d.impressions)) : null,
      ),
    [trafficTimeline],
  );

  const clicksTrendSeries = useMemo(
    () =>
      trafficTimeline.map((d) =>
        d.clicks != null ? Number(Math.round(d.clicks)) : null,
      ),
    [trafficTimeline],
  );

  const keywordMovementTrend = useMemo(() => {
    if (!baseAll.length) return [];
    const len = windowDays;
    const deltas = Array.from({ length: len }, () => ({
      improving: 0,
      declining: 0,
    }));
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
      const clamped = Math.max(
        1,
        Math.min(MAX_VISIBLE_RANK, Math.round(d.avgRank)),
      );
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
      const prevSlice = hist.slice(
        Math.max(0, len - windowDays * 2),
        Math.max(0, len - windowDays),
      );
      if (!prevSlice.length) return;
      const currentRank = latestDefinedRank(currentSlice);
      const prevRank = latestDefinedRank(prevSlice);
      if (currentRank == null || prevRank == null) return;
      const currValue = safeRank(currentRank);
      const prevValue = safeRank(prevRank);
      if (currValue > prevValue) declining += 1;
      else if (currValue < prevValue) improving += 1;

      const prevPrevSlice = hist.slice(
        Math.max(0, len - windowDays * 3),
        Math.max(0, len - windowDays * 2),
      );
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

  const avgRankDelta =
    avgRankCurrent != null && avgRankPrevious != null
      ? avgRankPrevious - avgRankCurrent
      : null;

  const impressionsCurrentTotal = useMemo(
    () =>
      trafficTimeline.reduce(
        (acc, d) => acc + (Number.isFinite(d.impressions) ? d.impressions : 0),
        0,
      ),
    [trafficTimeline],
  );

  const impressionsPreviousTotal = useMemo(
    () =>
      trafficTimelinePrevious.reduce(
        (acc, d) => acc + (Number.isFinite(d.impressions) ? d.impressions : 0),
        0,
      ),
    [trafficTimelinePrevious],
  );

  const clicksCurrentTotal = useMemo(
    () =>
      trafficTimeline.reduce(
        (acc, d) => acc + (Number.isFinite(d.clicks) ? d.clicks : 0),
        0,
      ),
    [trafficTimeline],
  );

  const clicksPreviousTotal = useMemo(
    () =>
      trafficTimelinePrevious.reduce(
        (acc, d) => acc + (Number.isFinite(d.clicks) ? d.clicks : 0),
        0,
      ),
    [trafficTimelinePrevious],
  );

  const hasPreviousTraffic = trafficTimelinePrevious.length === windowDays;

  const impressionsDelta = hasPreviousTraffic
    ? impressionsCurrentTotal - impressionsPreviousTotal
    : null;
  const clicksDelta = hasPreviousTraffic
    ? clicksCurrentTotal - clicksPreviousTotal
    : null;

  const comparisonHelper = hasPreviousWindow ? `vs 前一${windowDays}天` : null;

  const ctrCurrent =
    impressionsCurrentTotal > 0
      ? clicksCurrentTotal / impressionsCurrentTotal
      : null;
  const ctrPrevious =
    hasPreviousTraffic && impressionsPreviousTotal > 0
      ? clicksPreviousTotal / impressionsPreviousTotal
      : null;
  const ctrDelta =
    ctrCurrent != null && ctrPrevious != null ? ctrCurrent - ctrPrevious : null;

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
    keywordsWithRankPrevious != null
      ? keywordsWithRankCurrent - keywordsWithRankPrevious
      : null;

  const normalizeQueryKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "");

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
          volume: Number.isFinite(Number(item?.volume))
            ? Number(item.volume)
            : null,
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
      if (!collection.has(key))
        collection.set(
          key,
          Array.from({ length }, () => 0),
        );
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
      const impressions = Number(
        row?.impressions ??
          row?.total_impressions ??
          row?.sum_impressions ??
          row?.impr,
      );
      const clicks = Number(
        row?.clicks ?? row?.total_clicks ?? row?.sum_clicks ?? row?.click,
      );
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
      if (!totalsMap.has(key))
        totalsMap.set(key, { impressions: 0, clicks: 0 });
      const totals = totalsMap.get(key);
      if (Number.isFinite(impressions)) totals.impressions += impressions;
      if (Number.isFinite(clicks)) totals.clicks += clicks;
      if (length > 0 && Number.isFinite(impressions)) {
        const series = ensureSeries(seriesMap, key, length);
        series[index] += impressions;
      }
      if (!names.has(key)) names.set(key, queryStr);
      if (!pageMap.has(key)) {
        const rawPage =
          row?.page || row?.page_url || row?.displayUrl || row?.url;
        if (rawPage) pageMap.set(key, safeDecodeURL(rawPage));
      }
    });

    return { current, previous, names, currentSeries, previousSeries, pageMap };
  }, [
    rawResults,
    currentIndexMap,
    previousIndexMap,
    timeline.length,
    timelinePrevious.length,
  ]);

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
      const clicks = Number(
        row?.clicks ?? row?.total_clicks ?? row?.sum_clicks ?? row?.click,
      );
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
        const current = keywordAggregates.current.get(key) || {
          impressions: 0,
          clicks: 0,
        };
        const previous = keywordAggregates.previous.get(key) || {
          impressions: 0,
          clicks: 0,
        };
        const meta = queryMetaMap.get(key) || {};
        const label = meta.query || keywordAggregates.names.get(key) || "";
        const seriesCurrent = keywordAggregates.currentSeries.get(key) || [];
        const seriesPrevious = keywordAggregates.previousSeries.get(key) || [];
        const pageSource =
          meta.page || keywordAggregates.pageMap.get(key) || null;
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
        const arr =
          seriesCurrent.get(tag) ||
          Array.from({ length: row.seriesCurrent.length }, () => 0);
        row.seriesCurrent.forEach((value, idx) => {
          arr[idx] += value;
        });
        seriesCurrent.set(tag, arr);
      }

      if (Array.isArray(row.seriesPrevious) && row.seriesPrevious.length) {
        const arrPrev =
          seriesPrevious.get(tag) ||
          Array.from({ length: row.seriesPrevious.length }, () => 0);
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

  const authorSummary = useMemo(() => {
    const projectRows = Array.isArray(projectRowsFull)
      ? projectRowsFull.filter((row) => row && typeof row === "object")
      : [];

    const normaliseKey = (name) =>
      String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

    const AUTHOR_KEYS = new Set([
      "editor",
      "editors",
      "author",
      "authors",
      "writer",
      "writers",
    ]);
    const URL_KEYS = new Set([
      "url",
      "page",
      "targeturl",
      "landingpage",
      "articleurl",
      "link",
    ]);
    const keywordRows = Array.isArray(keywordSearchRows)
      ? keywordSearchRows.filter(
          (row) =>
            row &&
            typeof row === "object" &&
            typeof row.query === "string" &&
            row.query.trim(),
        )
      : [];
    const pageKeywordMap = new Map();
    const TITLE_KEYS = new Set([
      "title",
      "pagetitle",
      "articletitle",
      "headline",
      "posttitle",
      "articlename",
    ]);

    const findFieldValue = (record, validKeys) => {
      for (const [key, value] of Object.entries(record)) {
        if (typeof key !== "string") continue;
        const normalised = normaliseKey(key);
        if (!normalised) continue;
        if (validKeys.has(normalised)) return value;
        for (const candidate of validKeys) {
          if (candidate && normalised.startsWith(candidate)) return value;
        }
      }
      return null;
    };

    const pickPrimaryAuthor = (value) => {
      if (value == null) return null;
      const parts = String(value)
        .split(/[,&\/;；、\n]+/)
        .map((token) => token.trim())
        .filter(Boolean);
      return parts.length ? parts[0] : null;
    };

    const normaliseAuthorKey = (name) =>
      String(name || "")
        .trim()
        .toLowerCase();

    const normalisePageForLookup = (value) => {
      if (!value) return null;
      const decoded = safeDecodeURL(String(value));
      if (!decoded) return null;
      const trimmed = decoded.trim();
      if (!trimmed) return null;
      let candidate = trimmed;
      if (/^https?:\/\//i.test(candidate)) {
        // already absolute
      } else if (candidate.startsWith("//")) {
        candidate = `https:${candidate}`;
      } else if (/^[\w.-]+\.[A-Za-z]{2,}(\/.*)?$/.test(candidate)) {
        candidate = `https://${candidate.replace(/^\/+/, "")}`;
      } else if (primaryDomain) {
        const host = primaryDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        if (!host) return null;
        const path = candidate.startsWith("/") ? candidate : `/${candidate}`;
        candidate = `https://${host}${path}`;
      } else {
        return null;
      }
      try {
        const url = new URL(candidate);
        url.hash = "";
        const pathname = url.pathname.replace(/\/+$/, "");
        const formattedPath = pathname || "/";
        return `${url.origin}${formattedPath}${url.search || ""}`;
      } catch {
        return candidate.replace(/#.*$/, "").replace(/\/+$/, "");
      }
    };

    const collectKeywordsForPage = (pageValue, keyword, stats) => {
      if (!pageValue || !keyword) return;
      const normalized = normalisePageForLookup(pageValue);
      if (!normalized) return;
      const withoutQuery = normalized.split("?")[0];
      if (!withoutQuery) return;
      if (!pageKeywordMap.has(withoutQuery)) {
        pageKeywordMap.set(withoutQuery, []);
      }
      pageKeywordMap.get(withoutQuery)?.push({
        keyword,
        impressions: Number.isFinite(stats?.impressions)
          ? Number(stats.impressions)
          : 0,
        clicks: Number.isFinite(stats?.clicks) ? Number(stats.clicks) : 0,
      });
    };

    keywordRows.forEach((row) => {
      const keyword = String(row.query || "").trim();
      if (!keyword) return;
      collectKeywordsForPage(
        row.page,
        keyword,
        {
          impressions: row.impressions,
          clicks: row.clicks,
        },
      );
    });

    pageKeywordMap.forEach((list, key) => {
      if (!Array.isArray(list) || !list.length) {
        pageKeywordMap.delete(key);
        return;
      }
      const aggregates = new Map();
      list.forEach((item) => {
        if (!item || !item.keyword) return;
        const normalizedKeyword = item.keyword.toLowerCase();
        if (!aggregates.has(normalizedKeyword)) {
          aggregates.set(normalizedKeyword, {
            keyword: item.keyword,
            impressions: 0,
            clicks: 0,
          });
        }
        const entry = aggregates.get(normalizedKeyword);
        if (Number.isFinite(item.impressions)) {
          entry.impressions += Math.max(0, item.impressions);
        }
        if (Number.isFinite(item.clicks)) {
          entry.clicks += Math.max(0, item.clicks);
        }
      });
      const sorted = Array.from(aggregates.values()).sort((a, b) => {
        if (b.impressions !== a.impressions) {
          return b.impressions - a.impressions;
        }
        return b.clicks - a.clicks;
      });
      pageKeywordMap.set(key, sorted);
    });

    const extractArticleId = (url) => {
      if (typeof url !== "string") return null;
      const match = url.match(/\/article\/(\d+)/);
      return match ? match[1] : null;
    };

    const urlToAuthor = new Map();
    const urlNoQueryToAuthor = new Map();
    const articleIdToAuthor = new Map();
    const authorDisplay = new Map();
    const authorPages = new Map();
    const authorArticles = new Map();

    const registerAuthor = (rawAuthor) => {
      const primary = pickPrimaryAuthor(rawAuthor);
      if (!primary) return null;
      const key = normaliseAuthorKey(primary);
      if (!key) return null;
      if (!authorDisplay.has(key)) authorDisplay.set(key, primary.trim());
      if (!authorPages.has(key)) authorPages.set(key, new Set());
      if (!authorArticles.has(key)) authorArticles.set(key, new Map());
      return key;
    };

    const ensureAuthorArticles = (authorKey) => {
      if (!authorArticles.has(authorKey)) {
        authorArticles.set(authorKey, new Map());
      }
      return authorArticles.get(authorKey);
    };

    const ensureArticleEntry = (authorKey, normalized, withoutQuery, meta = {}) => {
      if (!authorKey || !normalized) return null;
      const key = withoutQuery || normalized;
      if (!key) return null;
      const collection = ensureAuthorArticles(authorKey);
      if (!collection.has(key)) {
        collection.set(key, {
          url: normalized,
          canonicalUrl: withoutQuery || normalized,
          title: meta.title ? String(meta.title).trim() : "",
          impressions: 0,
          impressionsPrev: 0,
          clicks: 0,
          clicksPrev: 0,
        });
      } else {
        const entry = collection.get(key);
        entry.url = normalized;
        if (meta.title && !entry.title) {
          entry.title = String(meta.title).trim();
        }
      }
      return collection.get(key);
    };

    const registerPageForAuthor = (authorKey, pageValue, meta = {}) => {
      if (!authorKey || !pageValue) return;
      const normalized = normalisePageForLookup(pageValue);
      if (!normalized) return;
      const withoutQuery = normalized.split("?")[0];
      if (!urlToAuthor.has(normalized)) urlToAuthor.set(normalized, authorKey);
      if (!urlNoQueryToAuthor.has(withoutQuery))
        urlNoQueryToAuthor.set(withoutQuery, authorKey);
      const articleId = extractArticleId(normalized);
      if (articleId && !articleIdToAuthor.has(articleId)) {
        articleIdToAuthor.set(articleId, authorKey);
      }
      authorPages.get(authorKey)?.add(withoutQuery);
      ensureArticleEntry(authorKey, normalized, withoutQuery, meta);
    };

    projectRows.forEach((record) => {
      const authorKey = registerAuthor(findFieldValue(record, AUTHOR_KEYS));
      if (!authorKey) return;
      const pageValue = findFieldValue(record, URL_KEYS);
      const titleValue = findFieldValue(record, TITLE_KEYS);
      registerPageForAuthor(authorKey, pageValue, { title: titleValue });
    });

    if (!urlToAuthor.size && !articleIdToAuthor.size) return [];

    const aggregates = new Map();
    const getAggregate = (authorKey) => {
      if (!aggregates.has(authorKey)) {
        aggregates.set(authorKey, {
          author: authorDisplay.get(authorKey) || authorKey,
          impressions: 0,
          impressionsPrev: 0,
          clicks: 0,
          clicksPrev: 0,
        });
      }
      return aggregates.get(authorKey);
    };

    const sourceRows = pageTrafficRows.length ? pageTrafficRows : rawResults;
    if (!Array.isArray(sourceRows) || !sourceRows.length) return [];

    sourceRows.forEach((row) => {
      if (!row) return;
      const dateVal =
        row?.["CAST(date AS DATE)"] || row?.date || row?.dt || row?.day;
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (Number.isNaN(d.getTime())) return;
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const bucket = currentDateSet.has(label)
        ? "current"
        : previousDateSet.has(label)
          ? "previous"
          : null;
      if (!bucket) return;

      const rawPage = row?.page || row?.page_url || row?.displayUrl || row?.url;
      if (!rawPage) return;
      const normalized = normalisePageForLookup(rawPage);
      if (!normalized) return;
      const withoutQuery = normalized.split("?")[0];
      const articleId = extractArticleId(normalized);
      let authorKey = null;
      if (articleId && articleIdToAuthor.has(articleId)) {
        authorKey = articleIdToAuthor.get(articleId);
      }
      if (!authorKey && urlToAuthor.has(normalized)) {
        authorKey = urlToAuthor.get(normalized);
      }
      if (!authorKey) {
        authorKey = urlNoQueryToAuthor.get(withoutQuery) || null;
      }
      if (!authorKey) {
        const inlineAuthor = findFieldValue(row, AUTHOR_KEYS);
        if (inlineAuthor) {
          authorKey = registerAuthor(inlineAuthor);
          if (authorKey) {
            registerPageForAuthor(authorKey, normalized);
          }
        }
      }
      if (!authorKey) return;

      const impressions = Number(
        row?.impressions ??
          row?.total_impressions ??
          row?.sum_impressions ??
          row?.impr,
      );
      const clicks = Number(
        row?.clicks ?? row?.total_clicks ?? row?.sum_clicks ?? row?.click,
      );
      if (!Number.isFinite(impressions) && !Number.isFinite(clicks)) return;

      const articleEntry = ensureArticleEntry(authorKey, normalized, withoutQuery);

      const aggregate = getAggregate(authorKey);
      if (bucket === "current") {
        if (Number.isFinite(impressions)) aggregate.impressions += impressions;
        if (Number.isFinite(clicks)) aggregate.clicks += clicks;
        if (articleEntry) {
          if (Number.isFinite(impressions))
            articleEntry.impressions += impressions;
          if (Number.isFinite(clicks)) articleEntry.clicks += clicks;
        }
      } else if (bucket === "previous") {
        if (Number.isFinite(impressions))
          aggregate.impressionsPrev += impressions;
        if (Number.isFinite(clicks)) aggregate.clicksPrev += clicks;
        if (articleEntry) {
          if (Number.isFinite(impressions))
            articleEntry.impressionsPrev += impressions;
          if (Number.isFinite(clicks)) articleEntry.clicksPrev += clicks;
        }
      }
    });

    const summary = Array.from(aggregates.entries())
      .map(([authorKey, stats]) => {
        const pages = authorPages.get(authorKey);
        const impressions = Math.round(stats.impressions);
        const impressionsPrev = Math.round(stats.impressionsPrev);
        const clicks = Math.round(stats.clicks);
        const clicksPrev = Math.round(stats.clicksPrev);
        const ctr =
          impressions > 0 && Number.isFinite(clicks) ? clicks / impressions : null;
        const ctrPrev =
          impressionsPrev > 0 && Number.isFinite(clicksPrev)
            ? clicksPrev / impressionsPrev
            : null;
        const articlesMap = authorArticles.get(authorKey);
        const articles = articlesMap
          ? Array.from(articlesMap.values())
              .map((article) => {
                const currentImpressions = Math.round(article.impressions);
                const currentClicks = Math.round(article.clicks);
                const previousImpressions = Math.round(article.impressionsPrev);
                const previousClicks = Math.round(article.clicksPrev);
                const canonicalKey =
                  article.canonicalUrl ||
                  (article.url ? article.url.split("?")[0] : null);
                const keywordStats =
                  (canonicalKey && pageKeywordMap.get(canonicalKey)) || [];
                const keywordLabels = keywordStats
                  .map((item) =>
                    item && typeof item.keyword === "string"
                      ? item.keyword.trim()
                      : "",
                  )
                  .filter(Boolean);
                const keywordsFull = keywordLabels;
                const keywordsLimited = keywordLabels.slice(0, 10);
                const ctrValue =
                  currentImpressions > 0 && Number.isFinite(currentClicks)
                    ? currentClicks / currentImpressions
                    : null;
                const ctrPrevValue =
                  previousImpressions > 0 && Number.isFinite(previousClicks)
                    ? previousClicks / previousImpressions
                    : null;
                return {
                  url: article.url,
                  canonicalUrl: article.canonicalUrl,
                  title: article.title,
                  impressions: currentImpressions,
                  impressionsPrev: previousImpressions,
                  clicks: currentClicks,
                  clicksPrev: previousClicks,
                  ctr: ctrValue,
                  ctrPrev: ctrPrevValue,
                  keywords: keywordsLimited,
                  keywordsFull,
                };
              })
              .sort((a, b) => b.impressions - a.impressions)
          : [];
        const articleCount =
          pages && pages.size ? pages.size : articles.length;
        return {
          authorKey,
          author: stats.author,
          impressions,
          impressionsPrev,
          impressionsDelta: impressions - impressionsPrev,
          clicks,
          clicksPrev,
          clicksDelta: clicks - clicksPrev,
          articleCount,
          ctr,
          ctrPrev,
          ctrDelta:
            ctr != null && ctrPrev != null
              ? ctr - ctrPrev
              : ctr != null && impressionsPrev === 0
                ? ctr
                : null,
          articles,
        };
      })
      .filter((row) => row.impressions || row.impressionsPrev || row.clicks || row.clicksPrev)
      .sort((a, b) => b.impressions - a.impressions);

    return summary;
  }, [
    projectRowsFull,
    pageTrafficRows,
    rawResults,
    currentDateSet,
    previousDateSet,
    primaryDomain,
    keywordSearchRows,
  ]);

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
        const href =
          url.startsWith("http://") || url.startsWith("https://")
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
        const href = row.page
          ? ensureAbsoluteUrl(row.page, primaryDomain)
          : null;
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
      const slice = hist.slice(
        Math.max(0, hist.length - windowDays * 2),
        Math.max(0, hist.length - windowDays),
      );
      const latest = latestDefinedRank(slice);
      if (latest != null && latest <= 10) count += 1;
    });
    return count;
  }, [baseAll, windowDays, hasPreviousWindow]);

  const top10Share = totalKeywords ? top10CurrentCount / totalKeywords : null;
  const top10SharePrevious =
    totalKeywords && top10PreviousCount != null
      ? top10PreviousCount / totalKeywords
      : null;
  const dropShare = totalKeywords
    ? keywordSummary.dropTop10 / totalKeywords
    : null;

  const overviewData = useMemo(
    () => ({
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
      authorSummary,
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
    }),
    [
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
      authorSummary,
      keywordMissingRows,
      keywordsWithRankCurrent,
      keywordsWithRankPrevious,
      keywordsWithRankDelta,
      primaryDomain,
      pageMovers,
      queryMovers,
      crossWindowMovement,
    ],
  );

  const ensureOverviewMetrics = useCallback(() => {
    setPageMetricsRequested(true);
    setIncludeKeywordMetrics(true);
  }, []);

  const pageMetricsReady = pageTrafficRows.length > 0;

  const value = useMemo(
    () => ({
      projects,
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
      projectRowsFull,
    }),
    [
      projects,
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
      projectRowsFull,
    ],
  );

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
