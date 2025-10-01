import { NextResponse } from "next/server";
import { getProjectById } from "@/app/lib/projects-store";
import { vercelFetch } from "@/app/lib/vercel-cache";

const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    const project = await getProjectById(id);
    if (!project) {
      return NextResponse.json({ error: `Unknown project id: ${id}` }, { status: 404 });
    }

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "30");
    const keyword = url.searchParams.get("keyword") || "";

    // 獲取項目的第一個記錄作為範例
    const records = Array.isArray(project.rows) ? project.rows : [];
    if (!records.length) {
      return NextResponse.json({ error: "No data rows in project" }, { status: 400 });
    }

    const sampleRecord = records[0];
    console.log("Sample record:", JSON.stringify(sampleRecord, null, 2));

    // 構建專門針對問題關鍵字的診斷查詢
    const targetKeyword = keyword || "蓮塘口岸停車場";
    const sql = `
      SELECT 
        date::DATE AS date,
        query,
        page,
        position,
        AVG(position) AS avg_position,
        SUM(impressions) AS total_impressions,
        SUM(clicks) AS total_clicks,
        COUNT(*) as row_count
      FROM {site_hourly}
      WHERE date::DATE >= CURRENT_DATE - INTERVAL '${days} days'
        AND date::DATE < CURRENT_DATE
        AND query ILIKE '%${targetKeyword}%'
        AND page LIKE '%459737%'
      GROUP BY date::DATE, query, page, position
      ORDER BY date::DATE DESC, query, position;
    `;

    // 推導網站
    const derivedSite = deriveSiteFromRecords(records);
    
    const payload = { 
      data_type: "hourly", 
      site: derivedSite, 
      sql: sql.trim() 
    };

    console.log("Diagnosis query:", payload);

    const res = await vercelFetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upstream error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    // 分析結果
    const analysis = {
      projectInfo: {
        id,
        recordCount: records.length,
        site: derivedSite,
        sampleRecord: {
          url: sampleRecord.url,
          keywords: sampleRecord.goalkeyword,
          tag: sampleRecord.trackingtag
        }
      },
      queryInfo: {
        days,
        keyword,
        sqlLength: sql.length
      },
      upstreamResponse: {
        totalResults: results.length,
        hasResults: results.length > 0
      }
    };

    if (results.length > 0) {
      const dates = results.map(r => r.date).filter(Boolean);
      const uniqueDates = [...new Set(dates)].sort();
      const queries = results.map(r => r.query).filter(Boolean);
      const uniqueQueries = [...new Set(queries)];

      analysis.dataAnalysis = {
        dateRange: {
          earliest: uniqueDates[0],
          latest: uniqueDates[uniqueDates.length - 1],
          totalDays: uniqueDates.length,
          recentDates: uniqueDates.slice(-5)
        },
        queries: {
          total: uniqueQueries.length,
          sample: uniqueQueries.slice(0, 10)
        },
        sampleRows: results.slice(0, 5).map(r => ({
          date: r.date,
          query: r.query,
          page: r.page,
          position: r.avg_position,
          impressions: r.total_impressions
        }))
      };

      // 檢查是否有重複的資料模式
      const positionsByQuery = {};
      results.forEach(r => {
        if (!positionsByQuery[r.query]) {
          positionsByQuery[r.query] = [];
        }
        positionsByQuery[r.query].push(r.avg_position);
      });

      analysis.duplicatePatterns = {};
      Object.entries(positionsByQuery).forEach(([query, positions]) => {
        const uniquePositions = [...new Set(positions)];
        if (uniquePositions.length === 1 && positions.length > 5) {
          analysis.duplicatePatterns[query] = {
            position: uniquePositions[0],
            occurrences: positions.length,
            suspicious: true
          };
        }
      });
    }

    return NextResponse.json({
      success: true,
      analysis,
      rawResults: results.slice(0, 20), // 只返回前20筆作為範例
      sql: sql.trim()
    });

  } catch (error) {
    console.error("Diagnosis error:", error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

// 輔助函數
function deriveSiteFromRecords(records) {
  for (const record of records) {
    const urlValue = record?.url;
    if (!urlValue) continue;
    try {
      const url = new URL(urlValue.includes("http") ? urlValue : `https://${urlValue}`);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if (host) return `sc-domain:${host}`;
    } catch {
      // ignore parse errors
    }
  }
  return null;
}