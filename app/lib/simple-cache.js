// 簡單的記憶體快取，避免 Next.js unstable_cache 的大小限制
const cache = new Map();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 小時

export function simpleCache(key, fn, ttl = CACHE_TTL, forceRefresh = false) {
  return async () => {
    const now = Date.now();
    const cached = cache.get(key);
    
    // 如果強制刷新，跳過快取檢查
    if (forceRefresh) {
      console.log(`[SimpleCache] Force refresh for key: ${key.slice(0, 50)}...`);
    } else if (cached && (now - cached.timestamp) < ttl) {
      console.log(`[SimpleCache] Cache hit for key: ${key.slice(0, 50)}...`);
      return cached.data;
    }
    
    // 執行函數並快取結果
    console.log(`[SimpleCache] Cache miss for key: ${key.slice(0, 50)}...`);
    const data = await fn();
    
    // 檢查資料大小，如果太大就不快取
    const dataSize = JSON.stringify(data).length;
    if (dataSize < 5000000) { // 5MB 限制
      cache.set(key, {
        data,
        timestamp: now
      });
      console.log(`[SimpleCache] Cached data (${dataSize} bytes) for key: ${key.slice(0, 50)}...`);
    } else {
      console.log(`[SimpleCache] Data too large (${dataSize} bytes), not caching`);
    }
    
    return data;
  };
}

export function clearCache(keyPattern) {
  let cleared = 0;
  for (const key of cache.keys()) {
    if (!keyPattern || key.includes(keyPattern)) {
      cache.delete(key);
      cleared++;
    }
  }
  console.log(`[SimpleCache] Cleared ${cleared} cache entries`);
  return cleared;
}

export function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  let totalSize = 0;
  
  for (const [key, value] of cache.entries()) {
    const age = now - value.timestamp;
    if (age < CACHE_TTL) {
      validEntries++;
    } else {
      expiredEntries++;
    }
    totalSize += JSON.stringify(value.data).length;
  }
  
  return {
    totalEntries: cache.size,
    validEntries,
    expiredEntries,
    totalSize,
    averageSize: cache.size > 0 ? Math.round(totalSize / cache.size) : 0
  };
}