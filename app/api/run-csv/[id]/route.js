import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const APP_DIR = process.cwd();
const DATA_DIR = path.join(APP_DIR, "app", "data");
const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const ONE_HOUR_MS = 60 * 60 * 1000;
const MIN_IMPRESSIONS_FOR_TOP = 5;

function parseIntOr(value, fallback) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseCSV(text) {
  const rows = [];
  let cur = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch === "\r") {
        // ignore
      } else {
        cur += ch;
      }
    }
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

function parseTSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map((ln) => ln.split("\t"));
}

function parseSource(text) {
  const firstLine = (text.match(/^[^\n\r]*$/m) || [""])[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  if (tabCount > commaCount) return parseTSV(text);
  return parseCSV(text);
}

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
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractArticleId(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/article\/(\d+)/);
  return m ? m[1] : null;
}

function sanitizeFileName(name) {
  if (name.includes("/") || name.includes("\\")) return null;
  return name;
}

function hashKey(obj) {
  const s = JSON.stringify(obj);
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

export async function GET(req, { params }) {
  try {
    const url = new URL(req.url);
    const p = await params;
    const id = p?.id || "default";
    const site = url.searchParams.get("site") || "sc-domain:holidaysmart.io";
    const days = parseIntOr(url.searchParams.get("days"), 21);
    const keywordsCol = parseIntOr(url.searchParams.get("keywordsCol"), 10);
    const pageUrlCol = parseIntOr(url.searchParams.get("pageUrlCol"), 15);
    const includeMetrics = url.searchParams.get("includeMetrics") === "1";
    const fileParam = url.searchParams.get("file");
    const refresh = url.searchParams.get("refresh") === "1";

    let csvFileName;
    if (fileParam) {
      const safe = sanitizeFileName(fileParam);
      if (!safe) {
        return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
      }
      csvFileName = safe;
    } else {
      csvFileName = `${id}.csv`;
    }

    const csvPath = path.join(DATA_DIR, csvFileName);
    let csvText;
    try {
      csvText = await fs.readFile(csvPath, "utf8");
    } catch {
      return NextResponse.json({ error: `CSV not found: ${csvFileName}` }, { status: 404 });
    }

    const rows = parseSource(csvText);
    if (!rows.length) {
      return NextResponse.json({ error: "CSV empty" }, { status: 400 });
    }
    const dataRows = rows.slice(1);

    const maxCol = Math.max(keywordsCol, pageUrlCol);
    const whereConditions = [];
    const canonicalUrlMap = new Map();
    const requestedMap = new Map();

    for (const r of dataRows) {
      if (!r || r.length < maxCol) continue;
      const pageUrl = r[pageUrlCol - 1];
      const queriesRaw = r[keywordsCol - 1];
      if (typeof pageUrl !== "string" || !pageUrl.trim() || !queriesRaw) continue;

      const pageId = extractArticleId(pageUrl);
      if (!pageId) continue;
      const prev = canonicalUrlMap.get(pageId);
      if (!prev || String(pageUrl).length > String(prev).length) {
        canonicalUrlMap.set(pageId, pageUrl);
      }

      const rawTag = typeof r[3] === "string" ? r[3].trim() : typeof r[2] === "string" ? r[2].trim() : "";

      const queryLines = String(queriesRaw)
        .split(/\r?\n|,|，|、|;|；|\/|／/)
        .map((s) => s.trim())
        .filter(Boolean);
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
        const cond = `(page LIKE '%${pageId}%' AND REGEXP_REPLACE(query, '\\s+', '', 'g') IN (${cleanedForSql.join(", ")}))`;
        whereConditions.push(cond);
      }
    }

    if (!whereConditions.length) {
      return NextResponse.json({ error: "No valid rows in CSV" }, { status: 400 });
    }

    const combinedWhere = whereConditions.join(" OR \n        ");
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
      file: csvFileName,
      site,
      days,
      keywordsCol,
      pageUrlCol,
      includeMetrics,
    });
    const tag = `run-csv:${id}`;
    if (refresh) {
      revalidateTag(tag);
    }

    const getData = unstable_cache(
      async () => {
        const payload = { data_type: "hourly", site, sql: sql.trim() };
        const res = await fetch(UPSTREAM, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          next: { revalidate: ONE_HOUR_MS / 1000 },
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
        const normalizedResults = Array.isArray(data?.results)
          ? data.results
              .map((row) => {
                const pid = extractArticleId(row.page);
                const canon = pid ? canonicalUrlMap.get(pid) || row.page : row.page;
                const normalized = { ...row, page: canon };
                if (includeMetrics) {
                  const impressions = Number(row.impressions ?? row.total_impressions ?? row.sum_impressions ?? row.impr);
                  if (Number.isFinite(impressions)) normalized.impressions = impressions;
                  const clicks = Number(row.clicks ?? row.total_clicks ?? row.sum_clicks ?? row.click);
                  if (Number.isFinite(clicks)) normalized.clicks = clicks;
                }
                return normalized;
              })
              .filter((row) => {
                const pos = Number(row.avg_position);
                if (!includeMetrics) return true;
                const impressions = Number(row.impressions ?? row.total_impressions ?? row.sum_impressions ?? row.impr);
                if (Number.isFinite(pos) && Math.round(pos) === 1) {
                  if (Number.isFinite(impressions) && impressions > 0 && impressions < MIN_IMPRESSIONS_FOR_TOP) {
                    return false;
                  }
                }
                return true;
              })
          : [];
        const meta = {
          csvRows: dataRows.length,
          parsedKeywords: requested.length,
          canonicalUrls: canonicalUrlMap.size,
          includeMetrics,
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
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
