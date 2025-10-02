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

    // 收集環境資訊
    const environment = {
      isVercel: process.env.VERCEL === '1',
      region: process.env.VERCEL_REGION || 'unknown',
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    // 收集快取統計（Simple Cache - 雖然現在不用了，但保留檢查）
    const simpleCacheStats = getCacheStats();

    // 檢查 Next.js Cache 的狀態（這個比較難直接檢查）
    const nextCacheInfo = {
      note: "Next.js unstable_cache 狀態無法直接檢查",
      revalidateSupported: typeof revalidateTag !== 'undefined',
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment,
      cacheStats: {
        simpleCache: simpleCacheStats,
        nextCache: nextCacheInfo,
      },
      message: "快取系統狀態檢查完成"
    });

  } catch (error) {
    console.error("Cache status check error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
}