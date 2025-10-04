import { createClient } from 'redis';

let redisClient = null;

// 建立 Redis 連接
async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
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
export async function createRedisCache(fn, keyParts, options = {}) {
  const {
    ttl = 14400, // 4 hours in seconds
    prefix = 'ranklens',
  } = options;

  // 建立 cache key
  const cacheKey = `${prefix}:${keyParts.join(':')}`;
  
  return async (...args) => {
    try {
      const client = await getRedisClient();
      
      // 嘗試從 Redis 取得快取資料
      const cached = await client.get(cacheKey);
      
      if (cached) {
        console.log(`[RedisCache] Cache HIT for key: ${cacheKey}`);
        return JSON.parse(cached);
      }
      
      console.log(`[RedisCache] Cache MISS for key: ${cacheKey}`);
      
      // 執行原始函數
      const result = await fn(...args);
      
      // 儲存到 Redis 並設定 TTL
      try {
        await client.setEx(cacheKey, ttl, JSON.stringify(result));
        console.log(`[RedisCache] Cached result for key: ${cacheKey}, TTL: ${ttl}s, size: ${JSON.stringify(result).length} bytes`);
      } catch (setError) {
        console.error(`[RedisCache] Failed to cache result for key ${cacheKey}:`, setError);
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
    const cacheKey = `${prefix}:${keyParts.join(':')}`;
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
    const fullPattern = `${prefix}:${pattern}`;
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
    const cacheKey = `${prefix}:${keyParts.join(':')}`;
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