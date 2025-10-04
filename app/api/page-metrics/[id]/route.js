import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import crypto from "node:crypto";

import { getProjectById } from "@/app/lib/projects-store";
import { createRedisCache } from "@/app/lib/redis-cache";
import { vercelFetch } from "@/app/lib/vercel-cache";

function safeEncodeUrl(url) {
  if (!url || typeof url !== "string") return url;
  
  // 簡化處理：只處理明顯需要編碼的情況
  try {
    // 檢查是否已經編碼
    if (url.includes('%')) {
      // 嘗試解碼，如果成功則重新編碼
      try {
        const decoded = decodeURIComponent(url);
        return decoded; // 返回解碼後的版本，讓資料庫處理
      } catch {
        return url; // 解碼失敗，返回原始 URL
      }
    }
    
    // 如果包含非 ASCII 字符，保持原樣讓資料庫處理
    return url;
  } catch {
    return url;
  }
}

const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const FOUR_HOUR_SECONDS = 4 * 60 * 60;

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
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;
    const refresh = url.searchParams.get("refresh") === "1";
    const limitParam = Number.parseInt(String(url.searchParams.get("limit") ?? "").trim(), 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 0;

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
    const uniqueConditions = new Set();
    const canonicalUrlMap = new Map();
    const exactUrlMap = new Map();

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
        const sanitized = pageUrl.replace(/'/g, "''");
        exactUrlMap.set(pageUrl, sanitized);
        const condition = `(page = '${sanitized}')`;
        whereConditions.push(condition);
      }
    });

    if (!whereConditions.length) {
      return NextResponse.json(
        { error: "No valid conditions derived from data" },
        { status: 400 },
      );
    }

    const targetPages = new Set(
      [
        ...Array.from(canonicalUrlMap.values()),
        ...Array.from(exactUrlMap.keys()),
      ].filter(Boolean),
    );

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

    const paramsHash = hashKey({
      id,
      site: derivedSite,
      days,
      limit,
    });
    const tag = `page-metrics:${id}`;
    if (refresh) {
      revalidateTag(tag);
    }

    const getData = createRedisCache(
      async () => {
        const payload = { data_type: "hourly", site: derivedSite, sql: sql.trim() };
        const res = await vercelFetch(UPSTREAM, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Upstream error ${res.status}: ${text.slice(0, 4000)}`
          );
        }
        const data = await res.json();
        const rows = Array.isArray(data?.results) ? data.results : [];
        const normalized = rows.map((row) => {
          const impressions = Number(
            row.impressions ??
            row.total_impressions ??
            row.sum_impressions ??
            row.impr
          );
          const clicks = Number(
            row.clicks ?? row.total_clicks ?? row.sum_clicks ?? row.click
          );
          const avgPosition = Number(
            row.avg_position ?? row.avg_pos ?? row.position
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
      ["page-metrics", id, paramsHash],
      { ttl: 14400 } // 4 hours
    );

    const startTime = Date.now();
    const cached = await getData();
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`[page-metrics] ${id} - Duration: ${duration}ms`);
    console.log(`[page-metrics] Cache key: page-metrics:${id}:${paramsHash}`);

    // 使用 NextResponse.json() 來正確處理 UTF-8 編碼
    // 確保 header 值不包含非 ASCII 字符
    const safeId = encodeURIComponent(id);
    
    return NextResponse.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=14400, stale-while-revalidate=86400",
        "X-Cache-Duration": duration.toString(),
        "X-Cache-Key": `page-metrics:${safeId.slice(0, 20)}:${paramsHash.slice(0, 8)}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
