import { NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

import { getProjectConfig } from "@/app/lib/project-config";

const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const ONE_HOUR_SECONDS = 60 * 60;
const APP_DIR = process.cwd();
const DATA_DIR = path.join(APP_DIR, "app", "data");

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
  const firstLine = (text.match(/^[^\n\r]*/m) || [""])[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  if (tabCount > commaCount) return parseTSV(text);
  return parseCSV(text);
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

export async function GET(req, { params }) {
  try {
    const url = new URL(req.url);
    const p = await params;
    const id = p?.id || "default";
    const siteParam = url.searchParams.get("site");
    const days = parseIntOr(url.searchParams.get("days"), 30);
    const refresh = url.searchParams.get("refresh") === "1";
    const limit = parseIntOr(url.searchParams.get("limit"), 0);

    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: "days must be a positive integer" }, { status: 400 });
    }

    const project = getProjectConfig(id);
    if (!project) {
      return NextResponse.json({ error: `Unknown project id: ${id}` }, { status: 404 });
    }

    const fileParam = url.searchParams.get("file") || project.file;
    const pageUrlCol = parseIntOr(url.searchParams.get("pageUrlCol"), project.pageUrlCol);

    if (!fileParam) {
      return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
    }
    if (!Number.isFinite(pageUrlCol) || pageUrlCol <= 0) {
      return NextResponse.json({ error: "Invalid column configuration" }, { status: 400 });
    }

    const csvPath = path.join(DATA_DIR, fileParam);
    let csvText;
    try {
      csvText = await fs.readFile(csvPath, "utf8");
    } catch {
      return NextResponse.json({ error: `CSV not found: ${fileParam}` }, { status: 404 });
    }

    const rows = parseSource(csvText);
    if (!rows.length) {
      return NextResponse.json({ error: "CSV empty" }, { status: 400 });
    }

    const dataRows = rows.slice(1);
    const whereConditions = [];
    const uniqueConditions = new Set();
    const canonicalUrlMap = new Map();
    const exactUrlMap = new Map();

    for (const r of dataRows) {
      if (!r || r.length < pageUrlCol) continue;
      const pageUrl = r[pageUrlCol - 1];
      if (typeof pageUrl !== "string") continue;
      const trimmed = pageUrl.trim();
      if (!trimmed) continue;

      const pageId = extractArticleId(trimmed);
      if (pageId) {
        const existing = canonicalUrlMap.get(pageId);
        if (!existing || String(trimmed).length > String(existing).length) {
          canonicalUrlMap.set(pageId, trimmed);
        }
        const condition = `(page LIKE '%${pageId}%')`;
        if (!uniqueConditions.has(condition)) {
          uniqueConditions.add(condition);
          whereConditions.push(condition);
        }
        continue;
      }

      if (!exactUrlMap.has(trimmed)) {
        const sanitized = trimmed.replace(/'/g, "''");
        exactUrlMap.set(trimmed, sanitized);
        const condition = `(page = '${sanitized}')`;
        whereConditions.push(condition);
      }
    }

    if (!whereConditions.length) {
      return NextResponse.json({ error: "No valid conditions derived from CSV" }, { status: 400 });
    }

    const targetPages = new Set([
      ...Array.from(canonicalUrlMap.values()),
      ...Array.from(exactUrlMap.keys()),
    ].filter(Boolean));

    const combinedWhere = whereConditions.join(" OR \n        ");
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

    const limitClause = limit && limit > 0
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

    const site = siteParam || project.site || "sc-domain:holidaysmart.io";
    const paramsHash = hashKey({ id, site, days, limit, file: fileParam, pageUrlCol });
    const tag = `page-metrics:${id}`;
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
          next: { revalidate: ONE_HOUR_SECONDS },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Upstream error ${res.status}: ${text.slice(0, 4000)}`);
        }
        const data = await res.json();
        const rows = Array.isArray(data?.results) ? data.results : [];
        const normalized = rows.map((row) => {
          const impressions = Number(row.impressions ?? row.total_impressions ?? row.sum_impressions ?? row.impr);
          const clicks = Number(row.clicks ?? row.total_clicks ?? row.sum_clicks ?? row.click);
          const avgPosition = Number(row.avg_position ?? row.avg_pos ?? row.position);
          const dateValue = row.date ?? row["CAST(date AS DATE)"] ?? row.dt ?? null;
          const rawPage = row.page ?? row.page_url ?? row.url ?? "";
          const pageId = extractArticleId(rawPage);
          const canonical = pageId
            ? canonicalUrlMap.get(pageId) || row.page
            : (typeof rawPage === "string" && exactUrlMap.has(rawPage.trim())
                ? rawPage.trim()
                : row.page);
          return {
            date: dateValue,
            page: canonical ?? row.page ?? row.page_url ?? row.url ?? null,
            impressions: Number.isFinite(impressions) ? impressions : null,
            clicks: Number.isFinite(clicks) ? clicks : null,
            avgPosition: Number.isFinite(avgPosition) ? avgPosition : null,
          };
        });
        const uniquePages = new Set(normalized.map((row) => row.page).filter(Boolean)).size;
        const meta = {
          rowCount: normalized.length,
          days,
          pages: uniquePages,
          conditions: whereConditions.length,
          targets: targetPages.size,
        };
        return { ...data, results: normalized, meta };
      },
      ["page-metrics", id, paramsHash],
      { revalidate: ONE_HOUR_SECONDS, tags: [tag] },
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
