import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import crypto from "node:crypto";
import { getProjectById } from "@/app/lib/projects-store";
import { createVercelCache, vercelFetch } from "@/app/lib/vercel-cache";

// 常數定義
const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const MIN_IMPRESSIONS_FOR_TOP = 5;
const FOUR_HOUR_SECONDS = 4 * 60 * 60;

// ========================================================================
// ## 輔助函式 (Helper Functions)
// ========================================================================

function cleanQueryForSql(original) {
  if (!original) return null;
  const withoutCount = String(original).replace(/\(\d+\)/g, "").trim();
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


// ========================================================================
// ## API 路由處理 (GET Handler)
// ========================================================================

export async function GET(req, { params }) {
  try {
    const url = new URL(req.url);
    const p = await params;
    const id = p?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    const project = await getProjectById(id);

    // ▼▼▼ 請在這裡加入偵錯程式碼 ▼▼▼
    console.log("--- DEBUG START ---");
    console.log("Project ID:", id);
    if (project && project.rows) {
      console.log("project.rows[0]:", JSON.stringify(project.rows[0], null, 2));
    } else {
      console.log("project.rows is missing, null, or empty.");
    }
    console.log("--- DEBUG END ---");
    // ▲▲▲ 請在這裡加入偵錯程式碼 ▲▲▲

    if (!project) {
      return NextResponse.json({ error: `Unknown project id: ${id}` }, { status: 404 });
    }

    const siteOverride = url.searchParams.get("site");
    const daysParam = Number.parseInt(String(url.searchParams.get("days") ?? "").trim(), 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 21;
    const refresh = url.searchParams.get("refresh") === "1";

    // ✅ **修正 1: 正確解析巢狀的 JSON 資料**
    const records = Array.isArray(project.rows)
      ? project.rows.filter((record) => record && typeof record === "object")
      : [];

    if (!records.length) {
      return NextResponse.json({ error: "Project has no data rows" }, { status: 400 });
    }

    const derivedSite = siteOverride || deriveSiteFromRecords(records);
    if (!derivedSite) {
      return NextResponse.json({ error: "Unable to derive site from data." }, { status: 400 });
    }

    // `WHERE` 條件的建立邏輯是正確的，保持不變
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
          requestedMap.set(key, { pageId, query: info.original, tag: rawTag || null, volume: volume ?? null });
        }
      }
      if (cleanedForSql.length) {
        const cond = `(page LIKE '%${pageId}%' AND REGEXP_REPLACE(query, '\\s+', '', 'g') IN (${cleanedForSql.join(", ")}))`;
        whereConditions.push(cond);
      }
    });

    console.log("WhereCondition:", whereConditions[0])

    if (!whereConditions.length) {
      return NextResponse.json({ error: "No valid rows in data" }, { status: 400 });
    }

    const combinedWhere = whereConditions.join(" OR \n        ");

    // ✅ **修正 2: 採用以關鍵字為中心的最終版 SQL**
    const sql = `
      SELECT
        date::DATE AS date,
        query,
        page,
        AVG(position) AS avg_position,
        SUM(impressions) AS total_impressions,
        SUM(clicks) AS total_clicks
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

    const paramsHash = hashKey({ id, site: derivedSite, days });
    const tag = `run-csv:${id}`;
    if (refresh) {
      revalidateTag(tag);
    }

    const getData = createVercelCache(
      async () => {
      const payload = { data_type: "hourly", site: derivedSite, sql: sql.trim() };
      const res = await vercelFetch(UPSTREAM, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upstream error ${res.status}: ${text.slice(0, 4000)}`);
      }

      const data = await res.json();

      const requested = Array.from(requestedMap.values()).map((p) => ({
        page: canonicalUrlMap.get(p.pageId) || undefined,
        query: p.query,
        tag: p.tag || null,
        volume: p.volume ?? null,
      }));

      // ✅ **修正 3: 歸一化結果並過濾**
      const normalizedResults = Array.isArray(data?.results) ? data.results : [];
      const filteredResults = normalizedResults
        .map((row) => {
          // 歸一化 page URL
          const rawPage = row.page ?? row.page_url ?? row.url ?? "";
          const pageId = extractArticleId(rawPage);
          const canonical = pageId
            ? canonicalUrlMap.get(pageId) || rawPage
            : rawPage;
          
          // 歸一化其他欄位
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
          
          return {
            ...row,
            date: dateValue,
            page: canonical,
            impressions: Number.isFinite(impressions) ? impressions : null,
            clicks: Number.isFinite(clicks) ? clicks : null,
            avg_position: Number.isFinite(avgPosition) ? avgPosition : null,
          };
        })
        .filter((row) => {
          const pos = Number(row.avg_position);
          const impressions = Number(row.impressions);
          // 依然可以保留對排名第一且曝光過低的結果的過濾邏輯
          if (Number.isFinite(pos) && Math.round(pos) === 1) {
            if (Number.isFinite(impressions) && impressions > 0 && impressions < MIN_IMPRESSIONS_FOR_TOP) {
              return false;
            }
          }
          return true;
        });

      const meta = {
        rowCount: records.length,
        parsedKeywords: requested.length,
        canonicalUrls: canonicalUrlMap.size,
        site: derivedSite,
        sourceMeta: project.meta ?? null,
        lastUpdated: project.lastUpdated ?? null,
      };

      const dataOut = { ...data, results: filteredResults };
      return { ...dataOut, requested, meta };
      },
      ["run-csv", id, paramsHash],
      { revalidate: FOUR_HOUR_SECONDS, tags: [tag] }
    );

    const startTime = Date.now();
    const cached = await getData();
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`[run-csv] ${id} - Duration: ${duration}ms`);
    console.log(`[run-csv] Cache key: run-csv:${id}:${paramsHash}`);
    console.log("result keys:", Object.keys(cached));
    console.log("result.results length:", cached.results?.length);
    console.log("canonicalUrlMap size:", canonicalUrlMap.size);
    console.log("canonicalUrlMap entries:", Array.from(canonicalUrlMap.entries()).slice(0, 3));
    
    return NextResponse.json(cached, {
      status: 200,
      headers: { 
        "Cache-Control": "s-maxage=14400, stale-while-revalidate=86400",
        "X-Cache-Duration": duration.toString(),
        "X-Cache-Key": `run-csv:${id}:${paramsHash.slice(0, 8)}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[API Error for ID: ${params.id}]`, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";