import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

// dynamic is defined above

const APP_DIR = process.cwd();
const DATA_DIR = path.join(APP_DIR, "app", "data");
const CACHE_DIR = path.join(DATA_DIR, "_cache");
const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const ONE_HOUR_MS = 60 * 60 * 1000;

function parseIntOr(value, fallback) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Minimal CSV parser: handles quotes and commas/newlines
function parseCSV(text) {
  const rows = [];
  let cur = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch === "\r") { /* ignore */ }
      else { cur += ch; }
    }
  }
  row.push(cur); rows.push(row);
  return rows;
}

function cleanQueryForSql(original) {
  if (!original) return null;
  const withoutCount = String(original).replace(/\(\d+\)/g, "").trim();
  if (!withoutCount) return null;
  const spaceless = withoutCount.replace(/\s+/g, "");
  return { original: withoutCount, spaceless };
}

function extractArticleId(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/article\/(\d+)/);
  return m ? m[1] : null;
}

function sanitizeFileName(name) {
  // Prevent path traversal; allow spaces and unicode, but no slashes
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
    const keywordsCol = parseIntOr(url.searchParams.get("keywordsCol"), 10); // 1-based
    const pageUrlCol = parseIntOr(url.searchParams.get("pageUrlCol"), 15); // 1-based
    const fileParam = url.searchParams.get("file");
    const refresh = url.searchParams.get("refresh") === "1";

    let csvFileName;
    if (fileParam) {
      const safe = sanitizeFileName(fileParam);
      if (!safe) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
      csvFileName = safe;
    } else {
      // fall back to <id>.csv
      csvFileName = `${id}.csv`;
    }

    const csvPath = path.join(DATA_DIR, csvFileName);
    let csvText;
    try {
      csvText = await fs.readFile(csvPath, "utf8");
    } catch {
      return NextResponse.json({ error: `CSV not found: ${csvFileName}` }, { status: 404 });
    }

    const rows = parseCSV(csvText);
    if (!rows.length) return NextResponse.json({ error: "CSV empty" }, { status: 400 });
    const dataRows = rows.slice(1);

    const maxCol = Math.max(keywordsCol, pageUrlCol);
    const whereConditions = [];
    const canonicalUrlMap = new Map();
    const requestedMap = new Map(); // key: pageId||spaceless -> { page, query }

    for (const r of dataRows) {
      if (!r || r.length < maxCol) continue;
      const pageUrl = r[pageUrlCol - 1];
      const queriesRaw = r[keywordsCol - 1];
      if (typeof pageUrl !== "string" || !pageUrl.trim() || !queriesRaw) continue;

      const pageId = extractArticleId(pageUrl);
      if (!pageId) continue;
      // Prefer longer URL as canonical (usually the one with slug)
      const prev = canonicalUrlMap.get(pageId);
      if (!prev || String(pageUrl).length > String(prev).length) {
        canonicalUrlMap.set(pageId, pageUrl);
      }

      // Support multiple delimiters: newline, comma (half/full), list marks, slash, semicolon
      const queryLines = String(queriesRaw)
        .split(/\r?\n|,|，|、|;|；|\/|／/)
        .map((s) => s.trim())
        .filter(Boolean);
      const cleanedForSql = [];
      for (const q of queryLines) {
        const info = cleanQueryForSql(q);
        if (!info) continue;
        cleanedForSql.push(`'${info.spaceless.replace(/'/g, "''")}'`);
        const key = `${pageId}||${info.spaceless}`;
        if (!requestedMap.has(key)) {
          requestedMap.set(key, { pageId, query: info.original });
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
    const sql = `
      SELECT date::DATE, query, page, AVG(position) AS avg_position
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

    // Cache lookup based on inputs
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheKey = hashKey({ id, file: csvFileName, site, days, keywordsCol, pageUrlCol });
    const cachePath = path.join(CACHE_DIR, `${id}-${cacheKey}.json`);
    if (!refresh) {
      try {
        const text = await fs.readFile(cachePath, "utf8");
        const cache = JSON.parse(text);
        const age = Date.now() - Number(cache?.ts || 0);
        if (Number.isFinite(age) && age >= 0 && age < ONE_HOUR_MS && cache?.data) {
          // Ensure requested keywords are returned even if old cache lacks it
          const requestPairs = Array.from(requestedMap.values()).map((p) => ({
            page: canonicalUrlMap.get(p.pageId) || undefined,
            query: p.query,
          }));
          const computedMeta = { csvRows: dataRows.length, parsedKeywords: requestPairs.length, canonicalUrls: canonicalUrlMap.size };
          const payload = cache?.requested ? cache : { ...cache, requested: requestPairs };
          const meta = cache?.meta || computedMeta;
          return NextResponse.json(payload.data ? { ...payload.data, requested: payload.requested, meta } : { ...payload, meta }, {
            status: 200,
            headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
          });
        }
      } catch { /* miss */ }
    }

    // Fetch upstream
    const payload = { data_type: "hourly", site, sql: sql.trim() };
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `Upstream error ${res.status}`, details: text.slice(0, 4000) }, { status: 502 });
    }
    const data = await res.json();
    const requested = Array.from(requestedMap.values()).map((p) => ({
      page: canonicalUrlMap.get(p.pageId) || undefined,
      query: p.query,
    }));
    const normalizedResults = Array.isArray(data?.results)
      ? data.results.map((row) => {
          const pid = extractArticleId(row.page);
          const canon = pid ? (canonicalUrlMap.get(pid) || row.page) : row.page;
          return { ...row, page: canon };
        })
      : [];
    const meta = { csvRows: dataRows.length, parsedKeywords: requested.length, canonicalUrls: canonicalUrlMap.size };

    // Save cache
    const dataOut = { ...data, results: normalizedResults };
    await fs.writeFile(cachePath, JSON.stringify({ ts: Date.now(), data: dataOut, requested, meta }, null, 2), "utf8");

    return NextResponse.json({ ...dataOut, requested, meta }, {
      status: 200,
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
