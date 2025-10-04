import { NextResponse } from "next/server";
import { getCacheInfo } from "@/app/lib/redis-cache";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    
    // 簡單的安全驗證
    const expectedSecret = process.env.CACHE_REFRESH_SECRET || "your-secret-key";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 檢查一些常見的 cache keys
    const cacheKeys = [
      ['projects'],
      ['run-csv', 'example', 'test'],
      ['page-metrics', 'example', 'test']
    ];

    const cacheStatus = {};
    
    for (const keyParts of cacheKeys) {
      const info = await getCacheInfo(keyParts);
      const keyName = keyParts.join(':');
      cacheStatus[keyName] = info;
    }

    return NextResponse.json({
      success: true,
      redis_url: process.env.REDIS_URL ? "configured" : "missing",
      cache_status: cacheStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Redis status check error:", error);
    return NextResponse.json({ 
      error: "Redis connection failed",
      details: error.message 
    }, { status: 500 });
  }
}