import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";

const APP_DIR = process.cwd();
const DATA_DIR = path.join(APP_DIR, "app", "data");
const DEFAULT_CSV = "SEO Work Allocation - HSHK 總表(更新中）.csv";
const DEFAULT_SITE = "sc-domain:holidaysmart.io"; // HSHK
const DEFAULT_DAYS = 21;
const RANK_QUERY_API = process.env.RANK_QUERY_API || "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";

function parseIntOr(value, fallback) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Simple CSV parser supporting commas, newlines, and double-quoted fields with escaped quotes
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
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch === "\r") {
        // ignore CR; handle CRLF by ignoring CR
      } else {
        cur += ch;
      }
    }
  }
  // push last field
  row.push(cur);
  rows.push(row);
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

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const fileParam = url.searchParams.get("file");
    const site = url.searchParams.get("site") || DEFAULT_SITE;
    const days = parseIntOr(url.searchParams.get("days"), DEFAULT_DAYS);
    const keywordsCol = parseIntOr(url.searchParams.get("keywordsCol"), 10); // 1-based
    const pageUrlCol = parseIntOr(url.searchParams.get("pageUrlCol"), 15); // 1-based
    const saveId = url.searchParams.get("save"); // optional: id to save under app/data/<id>.json

    const csvPath = path.join(DATA_DIR, fileParam || DEFAULT_CSV);
    const csv = await fs.readFile(csvPath, "utf8");
    const rows = parseCSV(csv);
    if (!rows.length) {
      return NextResponse.json({ error: "CSV empty" }, { status: 400 });
    }

    // Skip header row
    const dataRows = rows.slice(1);

    const maxCol = Math.max(keywordsCol, pageUrlCol);
    const whereConditions = [];
    const reportData = new Map(); // key: `${pageId}||${spaceless}` -> { page, query, positions: Map(date -> position) }
    const canonicalUrlMap = new Map(); // pageId -> canonical URL

    for (const r of dataRows) {
      if (!r || r.length < maxCol) continue;
      const pageUrl = r[pageUrlCol - 1];
      const queriesRaw = r[keywordsCol - 1];
      if (typeof pageUrl !== "string" || !pageUrl.trim() || !queriesRaw) continue;

      const pageId = extractArticleId(pageUrl);
      if (!pageId) continue;
      if (!canonicalUrlMap.has(pageId)) canonicalUrlMap.set(pageId, pageUrl);

      // Keywords may be newline-separated inside one cell
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
        if (!reportData.has(key)) {
          reportData.set(key, { page: pageUrl, query: info.original, positions: new Map() });
        }
      }
      if (cleanedForSql.length) {
        const cond = `(page LIKE '%${pageId}%' AND REGEXP_REPLACE(query, '\\s+', '', 'g') IN (${cleanedForSql.join(", ")}))`;
        whereConditions.push(cond);
      }
    }

    if (!whereConditions.length) {
      return NextResponse.json({ error: "No valid conditions from CSV" }, { status: 400 });
    }

    // Build SQL
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

    const payload = { data_type: "hourly", site, sql: sql.trim() };
    const res = await fetch(RANK_QUERY_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // Next automatically uses node-fetch in Node runtime
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Upstream error ${res.status}`, details: text.slice(0, 4000) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    // Build date headers
    const today = new Date();
    const dateHeaders = [];
    const dateHeaderMap = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const label = `${yyyy}-${mm}-${dd}`;
      dateHeaders.push(label);
      dateHeaderMap.set(label, dateHeaders.length - 1);
    }

    // Fill positions
    for (const row of results) {
      // API field names follow ref: {"CAST(date AS DATE)": ..., query, page, avg_position}
      const dateVal = row["CAST(date AS DATE)"] || row.date || row.dt;
      if (!dateVal || !row.page || !row.query) continue;
      const pageId = extractArticleId(row.page);
      if (!pageId) continue;
      const spaceless = String(row.query).replace(/\s+/g, "");
      const key = `${pageId}||${spaceless}`;
      if (!reportData.has(key)) {
        const canonical = canonicalUrlMap.get(pageId) || row.page;
        reportData.set(key, { page: canonical, query: row.query, positions: new Map() });
      }
      const d = new Date(dateVal);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const label = `${yyyy}-${mm}-${dd}`;
      if (!dateHeaderMap.has(label)) continue;
      const item = reportData.get(key);
      const pos = Number.parseFloat(row.avg_position);
      if (Number.isFinite(pos)) item.positions.set(label, Number(pos.toFixed(2)));
    }

    // Prepare output table-like JSON
    const headers = ["Page", "Keyword", ...dateHeaders];
    const rowsOut = [];
    for (const item of Array.from(reportData.values()).sort((a, b) => a.page.localeCompare(b.page))) {
      const row = { page: item.page, keyword: item.query, positions: {} };
      for (const d of dateHeaders) {
        if (item.positions.has(d)) row.positions[d] = item.positions.get(d);
      }
      rowsOut.push(row);
    }

    const payloadOut = { site, days, headers, rows: rowsOut };

    // Optionally save to app/data/<saveId>.json for later consumption
    if (saveId && /^[a-zA-Z0-9_-]{1,128}$/.test(saveId)) {
      if (process.env.VERCEL) {
        // Reject on Vercel since runtime FS is read-only
        return NextResponse.json(
          { error: "Save disabled on Vercel. Use a DB/KV or run locally." },
          { status: 405 }
        );
      }
      await fs.mkdir(DATA_DIR, { recursive: true });
      const dest = path.join(DATA_DIR, `${saveId}.json`);
      await fs.writeFile(dest, JSON.stringify(payloadOut, null, 2), "utf8");
    }

    return NextResponse.json(payloadOut, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
