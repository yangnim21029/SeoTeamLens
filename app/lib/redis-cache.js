import { createClient } from 'redis';

let redisClient = null;

// 建立 Redis 連接
async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      // 明確設定使用字串而非 Buffer，讓 Redis 處理 UTF-8 編碼
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });

    await redisClient.connect();
  }

  return redisClient;
}

// Redis Cache 包裝器
export function createRedisCache(fn, keyParts, options = {}) {
  const {
    ttl = 86400, // 24 hours in seconds
    prefix = 'ranklens',
  } = options;

  // 建立 cache key - 使用 encodeURIComponent 處理中文字元
  const encodedParts = keyParts.map(part =>
    typeof part === 'string' ? encodeURIComponent(part) : String(part)
  );
  const cacheKey = `${prefix}:${encodedParts.join(':')}`;

  return async (...args) => {
    try {
      const client = await getRedisClient();

      // 嘗試從 Redis 取得快取資料
      const cached = await client.get(cacheKey);

      if (cached) {
        console.log(`[RedisCache] Cache HIT for key: ${cacheKey}`);
        try {
          const parsed = JSON.parse(cached);
          return parsed;
        } catch (parseError) {
          console.error(`[RedisCache] Failed to parse cached data for key ${cacheKey}:`, parseError);
          console.error(`[RedisCache] Cached data type:`, typeof cached);
          console.error(`[RedisCache] Cached data length:`, cached?.length);
          console.error(`[RedisCache] First 200 chars:`, cached?.slice(0, 200));
          // 如果解析失敗，刪除損壞的快取並重新執行
          await client.del(cacheKey);
          console.log(`[RedisCache] Deleted corrupted cache for key: ${cacheKey}`);
        }
      }

      console.log(`[RedisCache] Cache MISS for key: ${cacheKey}`);

      // 執行原始函數
      const result = await fn(...args);

      // 儲存到 Redis 並設定 TTL
      try {
        const jsonString = JSON.stringify(result);
        await client.setEx(cacheKey, ttl, jsonString);
        console.log(`[RedisCache] Cached result for key: ${cacheKey}, TTL: ${ttl}s, size: ${jsonString.length} bytes`);
      } catch (setError) {
        console.error(`[RedisCache] Failed to cache result for key ${cacheKey}:`, setError);
        console.error(`[RedisCache] Error details:`, setError.stack);
        // 繼續返回結果，即使快取失敗
      }

      return result;
    } catch (error) {
      console.error(`[RedisCache] Error for key ${cacheKey}:`, error);
      // 如果 Redis 出錯，直接執行原始函數
      try {
        return await fn(...args);
      } catch (fnError) {
        console.error(`[RedisCache] Original function also failed for key ${cacheKey}:`, fnError);
        throw fnError;
      }
    }
  };
}

// 清除特定 key 的快取
export async function invalidateCache(keyParts, prefix = 'ranklens') {
  try {
    const client = await getRedisClient();
    const encodedParts = keyParts.map(part =>
      typeof part === 'string' ? encodeURIComponent(part) : String(part)
    );
    const cacheKey = `${prefix}:${encodedParts.join(':')}`;
    await client.del(cacheKey);
    console.log(`[RedisCache] Invalidated cache for key: ${cacheKey}`);
  } catch (error) {
    console.error(`[RedisCache] Error invalidating cache:`, error);
  }
}

// 清除符合 pattern 的所有快取
export async function invalidateCachePattern(pattern, prefix = 'ranklens') {
  try {
    const client = await getRedisClient();
    // Pattern 也需要編碼，但保留萬用字元 *
    const encodedPattern = pattern.split('*').map(part =>
      part ? encodeURIComponent(part) : ''
    ).join('*');
    const fullPattern = `${prefix}:${encodedPattern}`;
    const keys = await client.keys(fullPattern);

    if (keys.length > 0) {
      await client.del(keys);
      console.log(`[RedisCache] Invalidated ${keys.length} cache entries matching pattern: ${fullPattern}`);
    }
  } catch (error) {
    console.error(`[RedisCache] Error invalidating cache pattern:`, error);
  }
}

// 取得快取資訊
export async function getCacheInfo(keyParts, prefix = 'ranklens') {
  try {
    const client = await getRedisClient();
    const encodedParts = keyParts.map(part =>
      typeof part === 'string' ? encodeURIComponent(part) : String(part)
    );
    const cacheKey = `${prefix}:${encodedParts.join(':')}`;
    const ttl = await client.ttl(cacheKey);
    const exists = await client.exists(cacheKey);

    return {
      key: cacheKey,
      exists: exists === 1,
      ttl: ttl, // -1 表示沒有過期時間，-2 表示 key 不存在
    };
  } catch (error) {
    console.error(`[RedisCache] Error getting cache info:`, error);
    return null;
  }
}

// 關閉 Redis 連接（通常在應用程式關閉時使用）
export async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
