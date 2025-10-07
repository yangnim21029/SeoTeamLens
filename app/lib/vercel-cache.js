import { unstable_cache } from "next/cache";

// Vercel 優化的快取包裝器
export function createVercelCache(fn, keyParts, options = {}) {
  const {
    revalidate = 86400, // 24 hours
    tags = [],
  } = options;

  // 在 Vercel 上，確保 key 不會太長
  const cacheKey = keyParts
    .map(part => String(part).slice(0, 50)) // 限制每部分長度
    .join(':')
    .slice(0, 200); // 限制總長度

  console.log(`[VercelCache] Creating cache with key: ${cacheKey}, tags: ${tags.join(',')}`);

  return unstable_cache(
    async (...args) => {
      console.log(`[VercelCache] Cache MISS for key: ${cacheKey}`);
      const result = await fn(...args);
      console.log(`[VercelCache] Cached result for key: ${cacheKey}, size: ${JSON.stringify(result).length} bytes`);
      return result;
    },
    [cacheKey],
    {
      revalidate,
      tags: tags.map(tag => String(tag).slice(0, 50)), // 限制 tag 長度
    }
  );
}

// 檢查是否在 Vercel 環境
export function isVercelEnvironment() {
  return process.env.VERCEL === '1';
}

// Vercel 友好的 fetch 包裝器
export async function vercelFetch(url, options = {}) {
  const defaultOptions = {
    // 在 Vercel 上設定較短的超時時間
    signal: AbortSignal.timeout(50000), // 50 秒
    ...options,
  };

  // 在 Vercel 上，確保有適當的 headers
  if (isVercelEnvironment()) {
    defaultOptions.headers = {
      'User-Agent': 'RankLens/1.0',
      ...defaultOptions.headers,
    };
  }

  return fetch(url, defaultOptions);
}
