import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { createClient } from 'redis';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    
    // 簡單的安全驗證
    const expectedSecret = process.env.CACHE_REFRESH_SECRET || "your-secret-key";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Starting projects diagnosis...");
    const diagnosis = {};

    // 1. 測試資料庫連接和資料
    try {
      const { rows } = await sql`SELECT sheet_name, json_data, last_updated FROM synced_data LIMIT 1`;
      diagnosis.database = {
        success: true,
        sample_count: rows.length,
        sample_data: rows[0] ? {
          sheet_name: rows[0].sheet_name,
          json_length: rows[0].json_data ? JSON.stringify(rows[0].json_data).length : 0,
          has_json_data: !!rows[0].json_data
        } : null
      };
    } catch (error) {
      diagnosis.database = {
        success: false,
        error: error.message
      };
    }

    // 2. 測試 Redis 連接
    try {
      const redisClient = createClient({
        url: process.env.REDIS_URL,
      });
      await redisClient.connect();
      
      // 測試基本操作
      await redisClient.set('test:diagnosis', 'hello', { EX: 10 });
      const testValue = await redisClient.get('test:diagnosis');
      await redisClient.del('test:diagnosis');
      await redisClient.quit();
      
      diagnosis.redis = {
        success: true,
        test_value: testValue,
        url_configured: !!process.env.REDIS_URL
      };
    } catch (error) {
      diagnosis.redis = {
        success: false,
        error: error.message,
        url_configured: !!process.env.REDIS_URL
      };
    }

    // 3. 測試 JSON 解析
    try {
      const { rows } = await sql`SELECT sheet_name, json_data FROM synced_data LIMIT 1`;
      if (rows.length > 0) {
        const rawData = rows[0].json_data;
        
        // 嘗試解析 JSON
        let parsed;
        if (typeof rawData === 'string') {
          parsed = JSON.parse(rawData);
        } else {
          parsed = rawData; // 已經是 object
        }
        
        diagnosis.json_parsing = {
          success: true,
          raw_type: typeof rawData,
          parsed_type: typeof parsed,
          is_array: Array.isArray(parsed),
          sample_keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 5) : null
        };
      } else {
        diagnosis.json_parsing = {
          success: false,
          error: "No data to parse"
        };
      }
    } catch (error) {
      diagnosis.json_parsing = {
        success: false,
        error: error.message
      };
    }

    // 4. 測試完整的 projects-store 邏輯（不使用 cache）
    try {
      // 直接執行資料庫查詢和解析邏輯
      const { rows } = await sql`SELECT sheet_name, json_data, last_updated FROM synced_data`;
      
      function extractRecords(json) {
        if (Array.isArray(json)) {
          return json.filter((item) => item && typeof item === "object" && !Array.isArray(item));
        }
        if (json && typeof json === "object") {
          if (Array.isArray(json.rows)) {
            return json.rows.filter((item) => item && typeof item === "object" && !Array.isArray(item));
          }
          if (Array.isArray(json.data)) {
            return json.data.filter((item) => item && typeof item === "object" && !Array.isArray(item));
          }
        }
        return [];
      }

      function parseProjectRow(row) {
        const { sheet_name: sheetName, json_data: jsonData, last_updated: lastUpdated } = row;
        
        let parsed;
        if (typeof jsonData === "string") {
          parsed = JSON.parse(jsonData);
        } else {
          parsed = jsonData;
        }
        
        const records = extractRecords(parsed);
        const meta = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.meta ?? null : null;
        const labelCandidate = parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim() : null)
          : null;
        
        return {
          id: sheetName,
          label: labelCandidate || sheetName,
          rows: records,
          meta,
          lastUpdated,
        };
      }

      const projects = rows.map(parseProjectRow).filter((project) => Array.isArray(project.rows));
      
      diagnosis.projects_parsing = {
        success: true,
        raw_rows: rows.length,
        valid_projects: projects.length,
        sample_project: projects[0] ? {
          id: projects[0].id,
          label: projects[0].label,
          rows_count: projects[0].rows.length,
          has_meta: !!projects[0].meta
        } : null
      };
    } catch (error) {
      diagnosis.projects_parsing = {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }

    return NextResponse.json({
      success: true,
      diagnosis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Projects diagnosis error:", error);
    return NextResponse.json({ 
      error: "Diagnosis failed",
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}