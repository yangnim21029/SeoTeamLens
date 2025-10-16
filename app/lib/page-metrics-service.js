import crypto from "node:crypto";

import { createRedisCache, invalidateCache } from "./redis-cache";
import { vercelFetch } from "./vercel-cache";
import { getGscDbEndpoint } from "./gsc-endpoint";

const rankQueryOverride = process.env.RANK_QUERY_API;
const UPSTREAM =
  typeof rankQueryOverride === "string" && rankQueryOverride.trim()
    ? rankQueryOverride.trim()
    : getGscDbEndpoint();
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function safeEncodeUrl(url) {
  if (!url || typeof url !== "string") return url;
  try {
    if (url.includes("%")) {
      try {
        const decoded = decodeURIComponent(url);
        return decoded;
      } catch {
        return url;
      }
    }
    return url;
  } catch {
    return url;
  }
}

function extractArticleId(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/article\/(\d+)/);
  return m ? m[1] : null;
}

function hashKey(obj) {
  const s = JSON.stringify(obj);
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function normalizeUrlCandidate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function getFieldValue(record, targetKey) {
  if (!record || typeof record !== "object") return null;
  const normalise = (input) =>
    input.trim().toLowerCase().replace(/[_\s]+/g, "");
  const desired = normalise(targetKey);
  for (const [key, value] of Object.entries(record)) {
    if (typeof key !== "string") continue;
    if (normalise(key) === desired) return value;
  }
  return null;
}

function normaliseString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function deriveSiteFromRecords(records) {
  for (const record of records) {
    const urlValue = getFieldValue(record, "url");
    const normalized = normalizeUrlCandidate(urlValue);
    if (!normalized) continue;
    try {
      const url = new URL(normalized);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if (host) return `sc-domain:${host}`;
    } catch {
      // ignore parse errors
    }
  }
  return null;
}

function buildWhereConditions(records, canonicalUrlMap, exactUrlMap) {
  const whereConditions = [];
  const uniqueConditions = new Set();

  records.forEach((record) => {
    const pageUrlRaw = normaliseString(getFieldValue(record, "url"));
    if (!pageUrlRaw) return;

    const pageUrl = safeEncodeUrl(pageUrlRaw);
    const pageId = extractArticleId(pageUrl);
    if (pageId) {
      const existing = canonicalUrlMap.get(pageId);
      if (!existing || String(pageUrl).length > String(existing).length) {
        canonicalUrlMap.set(pageId, pageUrl);
      }
      const condition = `(page LIKE '%${pageId}%')`;
      if (!uniqueConditions.has(condition)) {
        uniqueConditions.add(condition);
        whereConditions.push(condition);
      }
      return;
    }

    if (!exactUrlMap.has(pageUrl)) {
      // 確保 URL 中的特殊字元（包含中文）被正確處理
      const sanitized = pageUrl.replace(/'/g, "''").replace(/\\/g, "\\\\");
      exactUrlMap.set(pageUrl, sanitized);
      const condition = `(page = '${sanitized}')`;
      whereConditions.push(condition);
    }
  });

  return whereConditions;
}

function buildSql({ whereConditions, limit, days }) {
  const combinedWhere = whereConditions.join(" OR ");
  const cte = `
      WITH page_rows AS (
        SELECT
          date::DATE AS date,
          page,
          AVG(position) AS avg_position,
          SUM(impressions) AS impressions,
          SUM(clicks) AS clicks
        FROM {site_hourly}
        WHERE date::DATE >= CURRENT_DATE - INTERVAL '${days} days'
          AND date::DATE < CURRENT_DATE
          AND page NOT LIKE '%#%'
          AND (
            ${combinedWhere}
          )
        GROUP BY date::DATE, page
      )
    `;

  const limitClause =
    limit > 0
      ? `WHERE page IN (
          SELECT page
          FROM (
            SELECT
              page,
              ROW_NUMBER() OVER (
                ORDER BY SUM(impressions) DESC NULLS LAST
              ) AS rank_order
            FROM page_rows
            GROUP BY page
          ) ranked_pages
          WHERE rank_order <= ${limit}
        )`
      : "";

  const sql = `
      ${cte}
      SELECT date, page, avg_position, impressions, clicks
      FROM page_rows
      ${limitClause}
      ORDER BY date ASC, impressions DESC NULLS LAST, page;
    `;
  return sql;
}

function normaliseRows(rows, canonicalUrlMap, exactUrlMap) {
  return rows.map((row) => {
    const impressions = Number(
      row.impressions ??
        row.total_impressions ??
        row.sum_impressions ??
        row.impr,
    );
    const clicks = Number(
      row.clicks ?? row.total_clicks ?? row.sum_clicks ?? row.click,
    );
    const avgPosition = Number(
      row.avg_position ?? row.avg_pos ?? row.position,
    );
    const dateValue =
      row.date ?? row["CAST(date AS DATE)"] ?? row.dt ?? null;
    const rawPage = row.page ?? row.page_url ?? row.url ?? "";
    const pageId = extractArticleId(rawPage);
    const canonical = pageId
      ? canonicalUrlMap.get(pageId) || row.page
      : typeof rawPage === "string" && exactUrlMap.has(rawPage.trim())
        ? rawPage.trim()
        : row.page;
    return {
      date: dateValue,
      page: canonical ?? row.page ?? row.page_url ?? row.url ?? null,
      impressions: Number.isFinite(impressions) ? impressions : null,
      clicks: Number.isFinite(clicks) ? clicks : null,
      avgPosition: Number.isFinite(avgPosition) ? avgPosition : null,
    };
  });
}

export async function fetchPageMetricsForProject(project, options = {}) {
  if (!project) {
    throw new Error("Project not found");
  }

  const {
    days = 30,
    limit = 0,
    refresh = false,
    siteOverride = null,
  } = options;

  const records = Array.isArray(project.rows)
    ? project.rows.filter((record) => record && typeof record === "object")
    : [];
  if (!records.length) {
    throw new Error("Project has no data rows");
  }

  const derivedSite = siteOverride || deriveSiteFromRecords(records);
  if (!derivedSite) {
    throw new Error("Unable to derive site from data.");
  }

  const canonicalUrlMap = new Map();
  const exactUrlMap = new Map();
  const whereConditions = buildWhereConditions(
    records,
    canonicalUrlMap,
    exactUrlMap,
  );

  if (!whereConditions.length) {
    throw new Error("No valid conditions derived from data");
  }

  const targetPages = new Set(
    [
      ...Array.from(canonicalUrlMap.values()),
      ...Array.from(exactUrlMap.keys()),
    ].filter(Boolean),
  );

  const sql = buildSql({ whereConditions, limit, days });

  const paramsHash = hashKey({
    id: project.id,
    site: derivedSite,
    days,
    limit,
  });

  if (refresh) {
    await invalidateCache(["page-metrics", project.id, paramsHash]);
  }

  const getData = createRedisCache(
    async () => {
      const payload = {
        data_type: "hourly",
        site: derivedSite,
        sql: sql.trim(),
      };
      const res = await vercelFetch(UPSTREAM, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Upstream error ${res.status}: ${text.slice(0, 4000)}`,
        );
      }
      const data = await res.json();
      const rows = Array.isArray(data?.results) ? data.results : [];
      const normalized = normaliseRows(rows, canonicalUrlMap, exactUrlMap);
      const uniquePages = new Set(
        normalized.map((row) => row.page).filter(Boolean),
      ).size;
      const meta = {
        rowCount: normalized.length,
        days,
        pages: uniquePages,
        conditions: whereConditions.length,
        targets: targetPages.size,
        site: derivedSite,
        sourceMeta: project.meta ?? null,
        lastUpdated: project.lastUpdated ?? null,
      };
      return { ...data, results: normalized, meta };
    },
    ["page-metrics", project.id, paramsHash],
    { ttl: CACHE_TTL_SECONDS },
  );

  const startTime = Date.now();
  const cached = await getData();
  const endTime = Date.now();
  const duration = endTime - startTime;

  return {
    payload: cached,
    duration,
    cacheKey: `page-metrics:${project.id}:${paramsHash}`,
  };
}

