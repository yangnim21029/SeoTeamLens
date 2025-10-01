import { NextResponse } from "next/server";

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

    // 測試快取功能
    const testCacheKey = `cache-test-${Date.now()}`;
    const testData = { test: true, timestamp: Date.now() };
    
    return NextResponse.json({
      status: 'ok',
      environment: envInfo,
      cacheTest: {
        key: testCacheKey,
        data: testData,
      },
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