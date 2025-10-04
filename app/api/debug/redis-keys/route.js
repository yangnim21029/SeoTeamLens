import { NextResponse } from "next/server";
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

    const redisClient = createClient({
      url: process.env.REDIS_URL,
    });
    await redisClient.connect();

    // 搜尋所有 ranklens 相關的 keys
    const allKeys = await redisClient.keys('ranklens:*');
    
    // 分類 keys
    const keysByType = {
      projects: [],
      'run-csv': [],
      'page-metrics': [],
      other: []
    };

    const keyDetails = [];

    for (const key of allKeys) {
      const ttl = await redisClient.ttl(key);
      const exists = await redisClient.exists(key);
      
      let type = 'other';
      if (key.includes(':projects')) type = 'projects';
      else if (key.includes(':run-csv:')) type = 'run-csv';
      else if (key.includes(':page-metrics:')) type = 'page-metrics';
      
      keysByType[type].push(key);
      
      keyDetails.push({
        key,
        type,
        exists: exists === 1,
        ttl,
        ttl_hours: ttl > 0 ? (ttl / 3600).toFixed(1) : null
      });
    }

    await redisClient.quit();

    return NextResponse.json({
      success: true,
      total_keys: allKeys.length,
      keys_by_type: {
        projects: keysByType.projects.length,
        'run-csv': keysByType['run-csv'].length,
        'page-metrics': keysByType['page-metrics'].length,
        other: keysByType.other.length
      },
      key_details: keyDetails.sort((a, b) => a.key.localeCompare(b.key)),
      sample_keys: {
        projects: keysByType.projects.slice(0, 3),
        'run-csv': keysByType['run-csv'].slice(0, 5),
        'page-metrics': keysByType['page-metrics'].slice(0, 5)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Redis keys check error:", error);
    return NextResponse.json({ 
      error: "Redis keys check failed",
      details: error.message 
    }, { status: 500 });
  }
}