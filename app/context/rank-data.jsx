"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  aggregateByUrl,
  buildRowsFromResults,
  dedupeRows,
  fillInteriorGaps,
  isDropFromTopN,
  MAX_VISIBLE_RANK,
} from "../lib/rank-utils";

const RankDataContext = createContext(null);

const PROJECTS = [
  { id: "hshk", label: "HSHK", file: "hshk_08.csv", site: "sc-domain:holidaysmart.io", keywordsCol: 14, pageUrlCol: 13 },
  { id: "top", label: "TopPage", file: "topPage_08.csv", site: "sc-domain:pretty.presslogic.com", keywordsCol: 2, pageUrlCol: 1 },
];

export function RankDataProvider({ children }) {
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [windowDays, setWindowDays] = useState(30);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceMeta, setSourceMeta] = useState(null);

  const activeProject = useMemo(
    () => PROJECTS.find((p) => p.id === projectId) || PROJECTS[0],
    [projectId],
  );
  const isMounted = useRef(false);
  const prevProjectId = useRef(projectId);

  useEffect(() => {
    let aborted = false;
    async function fetchData() {
      try {
        setLoading(true);
        setError("");
        const ts = forceRefresh ? `&_t=${Date.now()}` : "";
        const url = `/api/run-csv/${projectId}?file=${encodeURIComponent(activeProject.file)}&days=${windowDays}&site=${encodeURIComponent(activeProject.site)}&keywordsCol=${activeProject.keywordsCol}&pageUrlCol=${activeProject.pageUrlCol}${forceRefresh ? "&refresh=1" : ""}${ts}`;
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
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
    return () => {
      aborted = true;
    };
  }, [projectId, activeProject.file, activeProject.site, activeProject.keywordsCol, activeProject.pageUrlCol, windowDays, forceRefresh]);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      prevProjectId.current = projectId;
      return;
    }
    if (prevProjectId.current !== projectId) {
      setRows([]);
      prevProjectId.current = projectId;
    }
  }, [projectId]);

  const baseAll = useMemo(() => dedupeRows(rows), [rows]);
  const totalUrls = useMemo(() => new Set(baseAll.map((r) => r.displayUrl)).size, [baseAll]);
  const totalKeywords = baseAll.length;

  const groupedBase = useMemo(() => aggregateByUrl(baseAll, windowDays), [baseAll, windowDays]);

  const timeline = useMemo(() => {
    if (!baseAll.length) return [];
    const len = windowDays;
    const today = new Date();
    const baseUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const anchorUTC = baseUTC - 24 * 60 * 60 * 1000;
    return Array.from({ length: len }, (_, idx) => {
      const day = new Date(anchorUTC);
      day.setUTCDate(day.getUTCDate() - (len - 1 - idx));

      let sum = 0;
      let count = 0;
      let top10 = 0;
      let top20 = 0;

      baseAll.forEach((row) => {
        const hist = Array.isArray(row.history) ? row.history : [];
        const offset = Math.max(0, hist.length - len);
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
  }, [baseAll, windowDays, totalKeywords]);

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
    return { improving, declining, steady, dropTop10, currentTop10, currentTop20 };
  }, [groupedBase]);

  const avgRankCurrent = timeline.length ? timeline[timeline.length - 1].avgRank : null;
  const comparisonIdx = timeline.length > 7 ? timeline.length - 8 : 0;
  const avgRankComparison = timeline.length ? timeline[comparisonIdx]?.avgRank ?? null : null;
  const avgRankDelta = avgRankCurrent != null && avgRankComparison != null ? avgRankComparison - avgRankCurrent : null;

  const top10Share = totalKeywords ? keywordSummary.currentTop10 / totalKeywords : null;
  const dropShare = totalKeywords ? keywordSummary.dropTop10 / totalKeywords : null;

  const overviewData = useMemo(() => ({
    totalUrls,
    totalKeywords,
    avgRankCurrent,
    avgRankDelta,
    improvingKeywords: keywordSummary.improving,
    decliningKeywords: keywordSummary.declining,
    dropTop10: keywordSummary.dropTop10,
    currentTop10: keywordSummary.currentTop10,
    currentTop20: keywordSummary.currentTop20,
    top10Share,
    dropShare,
    timeline,
    trendSeries,
  }), [totalUrls, totalKeywords, avgRankCurrent, avgRankDelta, keywordSummary, top10Share, dropShare, timeline, trendSeries]);

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
  }), [projectId, windowDays, loading, error, sourceMeta, groupedBase, totalUrls, totalKeywords, overviewData, activeProject]);

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
