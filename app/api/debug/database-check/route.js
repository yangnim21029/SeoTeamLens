import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    
    // 簡單的安全驗證
    const expectedSecret = process.env.CACHE_REFRESH_SECRET || "your-secret-key";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Checking database connection and data...");

    // 檢查資料庫連接
    const connectionTest = await sql`SELECT NOW() as current_time`;
    console.log("Database connection successful:", connectionTest.rows[0]);

    // 檢查 synced_data 表
    const tableCheck = await sql`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(CASE WHEN json_data IS NOT NULL THEN 1 END) as rows_with_data,
        MAX(last_updated) as latest_update
      FROM synced_data
    `;
    
    console.log("Table stats:", tableCheck.rows[0]);

    // 獲取前幾筆資料樣本
    const sampleData = await sql`
      SELECT sheet_name, 
             LENGTH(json_data::text) as json_length,
             last_updated,
             LEFT(json_data::text, 100) as json_preview
      FROM synced_data 
      ORDER BY last_updated DESC 
      LIMIT 5
    `;

    console.log("Sample data:", sampleData.rows);

    return NextResponse.json({
      success: true,
      database_connection: connectionTest.rows[0],
      table_stats: tableCheck.rows[0],
      sample_data: sampleData.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Database check error:", error);
    return NextResponse.json({ 
      error: "Database check failed",
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}