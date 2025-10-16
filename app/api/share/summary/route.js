import { NextResponse } from "next/server";

import {
  getProjectById,
  loadProjectSummaries,
} from "@/app/lib/projects-store";
import { fetchPageMetricsForProject } from "@/app/lib/page-metrics-service";

const DEFAULT_WINDOW_DAYS = 7;

const SITE_ID_RULES = [
  {
    code: "GSTW",
    test: ({ host, path }) =>
      host === "girlstyle.com" && path.startsWith("/tw"),
  },
  {
    code: "GSMY",
    test: ({ host, path }) =>
      host === "girlstyle.com" && path.startsWith("/my"),
  },
  {
    code: "GSHK",
    test: ({ host }) => host === "pretty.presslogic.com",
  },
  {
    code: "TB",
    test: ({ host }) => host === "topbeautyhk.com",
  },
  {
    code: "PL",
    test: ({ host }) => host === "poplady-mag.com",
  },
  {
    code: "UL",
    test: ({ host }) => host === "urbanlifehk.com",
  },
  {
    code: "MD",
    test: ({ host }) => host === "mamidaily.com",
  },
  {
    code: "BF",
    test: ({ host }) => host === "businessfocus.io",
  },
  {
    code: "HSHK",
    test: ({ host, path }) =>
      host === "holidaysmart.io" && path.startsWith("/hk"),
  },
];

function normaliseHostPath(value) {
  if (!value || typeof value !== "string") return null;
  let raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("sc-domain:")) {
    raw = raw.slice("sc-domain:".length);
    if (!raw) return null;
    return {
      host: raw.toLowerCase(),
      path: "/",
      label: raw.toLowerCase(),
    };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(`https://${raw.replace(/^\/+/g, "")}`);
    } catch {
      return null;
    }
  }
  const host = url.hostname.toLowerCase();
  const pathRaw = url.pathname || "/";
  const path = pathRaw.replace(/\/+$/, "") || "/";
  const label = `${host}${path === "/" ? "" : path}`;
  return { host, path, label };
}

function collectSiteCandidates(project, site) {
  const set = new Set();
  if (site && typeof site === "string") set.add(site);
  const meta = project?.meta || {};
  [
    meta.primaryDomain,
    meta.domain,
    meta.site,
    meta.homepage,
    meta.url,
  ]
    .filter((val) => typeof val === "string" && val.trim())
    .forEach((val) => set.add(val.trim()));

  if (Array.isArray(project?.rows)) {
    const urlKeys = [
      "url",
      "page",
      "pageurl",
      "targeturl",
      "landingpage",
      "articleurl",
      "link",
    ];
    for (const record of project.rows.slice(0, 6)) {
      if (!record || typeof record !== "object") continue;
      for (const [key, value] of Object.entries(record)) {
        if (typeof value !== "string") continue;
        const normalisedKey = key.toLowerCase();
        if (urlKeys.some((candidate) => normalisedKey.includes(candidate))) {
          const trimmed = value.trim();
          if (trimmed) set.add(trimmed);
        }
      }
    }
  }

  return Array.from(set);
}

function mapSiteId(project, site) {
  const candidates = collectSiteCandidates(project, site);
  let fallbackLabel = null;

  for (const candidate of candidates) {
    const parsed = normaliseHostPath(candidate);
    if (!parsed) continue;
    if (!fallbackLabel) fallbackLabel = parsed.label;
    for (const rule of SITE_ID_RULES) {
      if (rule.test(parsed)) {
        return { siteId: rule.code, siteLabel: parsed.label };
      }
    }
  }

  return {
    siteId: null,
    siteLabel: fallbackLabel || (typeof site === "string" ? site : ""),
  };
}

function normaliseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function aggregateDailyMetrics(results = []) {
  const daily = new Map();
  results.forEach((row) => {
    if (!row) return;
    const dateKey = normaliseDate(
      row.date ?? row["CAST(date AS DATE)"] ?? row.dt,
    );
    if (!dateKey) return;
    if (!daily.has(dateKey)) {
      daily.set(dateKey, {
        clicks: 0,
        impressions: 0,
        positionWeighted: 0,
        positionWeight: 0,
        fallbackPositions: [],
      });
    }
    const entry = daily.get(dateKey);
    const clicks = Number(row.clicks);
    const impressions = Number(row.impressions);
    const avgPosition = Number(row.avgPosition);

    if (Number.isFinite(clicks)) {
      entry.clicks += clicks;
    }
    if (Number.isFinite(impressions)) {
      entry.impressions += impressions;
    }
    if (Number.isFinite(avgPosition)) {
      if (Number.isFinite(impressions) && impressions > 0) {
        entry.positionWeighted += avgPosition * impressions;
        entry.positionWeight += impressions;
      } else {
        entry.fallbackPositions.push(avgPosition);
      }
    }
  });
  return daily;
}

function summarisePeriod(dailyMap, dates) {
  if (!dates.length) return null;
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  let positionWeight = 0;
  const fallbackPositions = [];

  dates.forEach((date) => {
    const entry = dailyMap.get(date);
    if (!entry) return;
    clicks += entry.clicks;
    impressions += entry.impressions;
    positionWeighted += entry.positionWeighted;
    positionWeight += entry.positionWeight;
    if (Array.isArray(entry.fallbackPositions)) {
      fallbackPositions.push(...entry.fallbackPositions);
    }
  });

  const position =
    positionWeight > 0
      ? positionWeighted / positionWeight
      : fallbackPositions.length
        ? fallbackPositions.reduce((sum, val) => sum + val, 0) /
          fallbackPositions.length
        : null;
  const ctr = impressions > 0 ? clicks / impressions : null;

  return {
    clicks,
    impressions,
    ctr,
    position,
  };
}

function computeWeeklyComparison(results, windowDays = DEFAULT_WINDOW_DAYS) {
  if (!Array.isArray(results) || !results.length) {
    return {
      current: null,
      previous: null,
      delta: {
        clicks: null,
        impressions: null,
        ctr: null,
        position: null,
      },
    };
  }

  const daily = aggregateDailyMetrics(results);
  const sortedDates = Array.from(daily.keys()).sort();
  if (!sortedDates.length) {
    return {
      current: null,
      previous: null,
      delta: {
        clicks: null,
        impressions: null,
        ctr: null,
        position: null,
      },
    };
  }

  const currentDates = sortedDates.slice(-windowDays);
  const previousDates = sortedDates.slice(
    Math.max(0, sortedDates.length - windowDays * 2),
    Math.max(0, sortedDates.length - windowDays),
  );

  const current = summarisePeriod(daily, currentDates);
  const previous = summarisePeriod(daily, previousDates);

  const delta = {
    clicks:
      current?.clicks != null && previous?.clicks != null
        ? current.clicks - previous.clicks
        : null,
    impressions:
      current?.impressions != null && previous?.impressions != null
        ? current.impressions - previous.impressions
        : null,
    ctr:
      current?.ctr != null && previous?.ctr != null
        ? current.ctr - previous.ctr
        : null,
    position:
      current?.position != null && previous?.position != null
        ? current.position - previous.position
        : null,
  };

  return { current, previous, delta };
}

function formatInteger(value) {
  if (value == null) return "";
  return Math.round(value).toString();
}

function formatPercent(value, digits = 2) {
  if (value == null) return "";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDecimal(value, digits = 2) {
  if (value == null) return "";
  return value.toFixed(digits);
}

function formatDelta(value, formatter) {
  if (value == null) return "";
  if (value === 0) return `±${formatter(0)}`;
  const formatted = formatter(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  return `-${formatted}`;
}

function escapeTsvCell(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes('"')) {
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  if (str.includes("\t") || str.includes("\n")) {
    return `"${str}"`;
  }
  return str;
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const windowParam = Number.parseInt(
      String(url.searchParams.get("window") ?? "").trim(),
      10,
    );
    const refresh = url.searchParams.get("refresh") === "1";
    const windowDays =
      Number.isFinite(windowParam) && windowParam > 0
        ? windowParam
        : DEFAULT_WINDOW_DAYS;
    const fetchDays = windowDays * 2;

    const summaries = await loadProjectSummaries();
    if (!Array.isArray(summaries) || !summaries.length) {
      return NextResponse.json(
        { results: [], rows: [], header: [], tsv: "", windowDays },
        { status: 200 },
      );
    }

    const ordered = summaries.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );

    const results = [];
    const errors = [];

    for (const summary of ordered) {
      try {
        const project = await getProjectById(summary.id);
        if (!project) {
          errors.push({
            id: summary.id,
            label: summary.label,
            error: "Project data not found",
          });
          continue;
        }

        const { payload } = await fetchPageMetricsForProject(project, {
          days: fetchDays,
          limit: 0,
          refresh,
        });

        const comparison = computeWeeklyComparison(
          payload?.results ?? [],
          windowDays,
        );

        const site =
          payload?.meta?.site ??
          project.meta?.site ??
          project.meta?.primaryDomain ??
          null;
        const { siteId, siteLabel } = mapSiteId(project, site);
        const urlCount = Number.isFinite(Number(summary.rowCount))
          ? Number(summary.rowCount)
          : Array.isArray(project.rows)
            ? project.rows.length
            : null;

        results.push({
          id: summary.id,
          label: summary.label,
          lastUpdated: project.lastUpdated ?? summary.lastUpdated ?? null,
          meta: payload?.meta ?? null,
          site,
          siteId,
          siteLabel,
          urlCount,
          ...comparison,
        });
      } catch (error) {
        errors.push({
          id: summary.id,
          label: summary.label,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const header = [
      "Project",
      "Site ID",
      "Completed Pages",
      "Last Week\nClicks",
      "Period Week\nClicks",
      "Last Week\nImpressions",
      "Period Week\nImpressions",
      "Last Week\nCTR",
      "Period Week\nCTR",
      "Last Week\nPosition",
      "Period Week\nPosition",
    ];

    const sortedResults = results.slice().sort((a, b) => {
      const ta = a.lastUpdated ? Date.parse(a.lastUpdated) : null;
      const tb = b.lastUpdated ? Date.parse(b.lastUpdated) : null;
      if (ta == null && tb == null) {
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      }
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (ta === tb) {
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      }
      return ta - tb;
    });

    const rows = sortedResults.map((item) => {
      const current = item.current ?? {};
      const previous = item.previous ?? {};
      const siteLabel = item.siteLabel || item.site || "";
      const siteOutput = item.siteId || siteLabel;
      return [
        item.label,
        siteOutput,
        formatInteger(item.urlCount),
        formatInteger(current.clicks),
        formatInteger(previous.clicks),
        formatInteger(current.impressions),
        formatInteger(previous.impressions),
        formatPercent(current.ctr, 2),
        formatPercent(previous.ctr, 2),
        formatDecimal(current.position, 2),
        formatDecimal(previous.position, 2),
      ];
    });

    const tsvLines = [
      header.map(escapeTsvCell).join("\t"),
      ...rows.map((row) => row.map(escapeTsvCell).join("\t")),
    ];

    return NextResponse.json(
      {
        windowDays,
        fetchDays,
        generatedAt: new Date().toISOString(),
        header,
        rows,
        tsv: tsvLines.join("\n"),
        results: sortedResults,
        errors,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=1800, stale-while-revalidate=900",
        },
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
