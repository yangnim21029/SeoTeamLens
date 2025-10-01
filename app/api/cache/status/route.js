import { NextResponse } from "next/server";
import { getCacheStats } from "@/app/lib/simple-cache";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    
    // 簡單的安全驗證
    const expectedSecret = process.env.CACHE_REFRESH_SECRET || "your-secret-key";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 獲取環境資訊
    const envInfo = {
      isVercel: process.env.VERCEL === '1',
      nodeEnv: process.env.NODE_ENV,
      region: process.env.VERCEL_REGION || 'unknown',
      runtime: 'nodejs',
      timestamp: new Date().toISOString(),
    };

    // 獲取快取統計
    const cacheStats = getCacheStats();
    
    return NextResponse.json({
      status: 'ok',
      environment: envInfo,
      cache: cacheStats,
      message: 'Cache system is operational'
    });

  } catch (error) {
    console.error("Cache status check error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
}

export const runtime = "nodejs";