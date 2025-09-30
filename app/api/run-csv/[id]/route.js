import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import crypto from "node:crypto";

import { getProjectById } from "@/app/lib/projects-store";

const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const ONE_HOUR_MS = 60 * 60 * 1000;
const MIN_IMPRESSIONS_FOR_TOP = 5;

function cleanQueryForSql(original) {
  if (!original) return null;
  const withoutCount = String(original)
    .replace(/\(\d+\)/g, "")
    .trim();
  if (!withoutCount) return null;
  const spaceless = withoutCount.replace(/\s+/g, "");
  return { original: withoutCount, spaceless };
}

function extractVolume(text) {
  if (!text) return null;
  const match = String(text).match(/\((\d+)\)(?!.*\(\d+\))/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
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
  const normalise = (input) => input.trim().toLowerCase().replace(/[_\s]+/g, "");
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

function normaliseQueryLines(value) {
  return String(value)
    .split(/\r?\n|,|，|、|;|；|\/|／/)
    .map((part) => part.trim())
    .filter(Boolean);
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

export async function GET(req, { params }) {
  try {
    const url = new URL(req.url);
    const p = await params;
    const id = p?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    const project = await getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: `Unknown project id: ${id}` },
        { status: 404 },
      );
    }

    const siteOverride = url.searchParams.get("site");
    const daysParam = Number.parseInt(String(url.searchParams.get("days") ?? "").trim(), 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 21;
    const includeMetrics = url.searchParams.get("includeMetrics") === "1";
    const refresh = url.searchParams.get("refresh") === "1";

    const records = Array.isArray(project.rows)
      ? project.rows.filter((record) => record && typeof record === "object")
      : [];
    if (!records.length) {
      return NextResponse.json({ error: "Project has no data rows" }, { status: 400 });
    }

    const derivedSite = siteOverride || deriveSiteFromRecords(records);
    if (!derivedSite) {
      return NextResponse.json(
        { error: "Unable to derive site from data." },
        { status: 400 },
      );
    }

    const whereConditions = [];
    const canonicalUrlMap = new Map();
    const requestedMap = new Map();

    records.forEach((record) => {
      const pageUrl = normaliseString(getFieldValue(record, "url"));
      const queriesRaw = getFieldValue(record, "goalkeyword");
      if (!pageUrl || !queriesRaw) return;

      const pageId = extractArticleId(pageUrl);
      if (!pageId) return;
      const prev = canonicalUrlMap.get(pageId);
      if (!prev || String(pageUrl).length > String(prev).length) {
        canonicalUrlMap.set(pageId, pageUrl);
      }

      const rawTag = normaliseString(getFieldValue(record, "trackingtag"));

      const queryLines = normaliseQueryLines(queriesRaw);
      const cleanedForSql = [];
      for (const q of queryLines) {
        const info = cleanQueryForSql(q);
        if (!info) continue;
        cleanedForSql.push(`'${info.spaceless.replace(/'/g, "''")}'`);
        const volume = extractVolume(q);
        const key = `${pageId}||${info.spaceless}`;
        if (!requestedMap.has(key)) {
          requestedMap.set(key, {
            pageId,
            query: info.original,
            tag: rawTag || null,
            volume: volume ?? null,
          });
        }
      }
      if (cleanedForSql.length) {
        const cond = `(page LIKE '%${pageId}%' AND REGEXP_REPLACE(query, '\s+', '', 'g') IN (${cleanedForSql.join(", ")}))`;
        whereConditions.push(cond);
      }
    });

    if (!whereConditions.length) {
      return NextResponse.json(
        { error: "No valid rows in data" },
        { status: 400 },
      );
    }

    const combinedWhere = whereConditions.join(" OR \\n        " );
    const metricsSql = includeMetrics
      ? `,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks`
      : "";

    const sql = `
      SELECT
        date::DATE,
        query,
        page,
        AVG(position) AS avg_position${metricsSql}
      FROM {site_hourly}
      WHERE date::DATE >= CURRENT_DATE - INTERVAL '${days} days'
        AND date::DATE < CURRENT_DATE
        AND page NOT LIKE '%#%'
        AND (
          ${combinedWhere}
        )
      GROUP BY date::DATE, query, page
      ORDER BY date::DATE, query;
    `;

    const paramsHash = hashKey({
      id,
      site: derivedSite,
      days,
      includeMetrics,
    });
    const tag = `run-csv:${id}`;
    if (refresh) {
      revalidateTag(tag);
    }

    const getData = unstable_cache(
      async () => {
        const payload = { data_type: "hourly", site: derivedSite, sql: sql.trim() };
        const res = await fetch(UPSTREAM, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          next: { revalidate: ONE_HOUR_MS / 1000 },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Upstream error ${res.status}: ${text.slice(0, 4000)}`,
          );
        }
        const data = await res.json();
        const requested = Array.from(requestedMap.values()).map((p) => ({
          page: canonicalUrlMap.get(p.pageId) || undefined,
          query: p.query,
          tag: p.tag || null,
          volume: p.volume ?? null,
        }));
        const normalizedResults = Array.isArray(data?.results)
          ? data.results
              .map((row) => {
                const pid = extractArticleId(row.page);
                const canon = pid
                  ? canonicalUrlMap.get(pid) || row.page
                  : row.page;
                const normalized = { ...row, page: canon };
                if (includeMetrics) {
                  const impressions = Number(
                    row.impressions ??
                      row.total_impressions ??
                      row.sum_impressions ??
                      row.impr,
                  );
                  if (Number.isFinite(impressions)) normalized.impressions = impressions;
                  const clicks = Number(
                    row.clicks ??
                      row.total_clicks ??
                      row.sum_clicks ??
                      row.click,
                  );
                  if (Number.isFinite(clicks)) normalized.clicks = clicks;
                }
                return normalized;
              })
              .filter((row) => {
                const pos = Number(row.avg_position);
                if (!includeMetrics) return true;
                const impressions = Number(
                  row.impressions ??
                    row.total_impressions ??
                    row.sum_impressions ??
                    row.impr,
                );
                if (Number.isFinite(pos) && Math.round(pos) === 1) {
                  if (
                    Number.isFinite(impressions) &&
                    impressions > 0 &&
                    impressions < MIN_IMPRESSIONS_FOR_TOP
                  ) {
                    return false;
                  }
                }
                return true;
              })
          : [];
        const meta = {
          rowCount: records.length,
          parsedKeywords: requested.length,
          canonicalUrls: canonicalUrlMap.size,
          includeMetrics,
          site: derivedSite,
          sourceMeta: project.meta ?? null,
          lastUpdated: project.lastUpdated ?? null,
        };
        const dataOut = { ...data, results: normalizedResults };
        return { ...dataOut, requested, meta };
      },
      ["run-csv", id, paramsHash],
      { revalidate: ONE_HOUR_MS / 1000, tags: [tag] },
    );

    const cached = await getData();
    return NextResponse.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
