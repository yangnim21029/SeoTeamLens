import { NextResponse } from "next/server";
import { invalidateCachePattern } from "@/app/lib/redis-cache";
import { requireAdmin } from "@/app/lib/auth";

export const POST = requireAdmin(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { projectIds, secret, days = [7, 30, 60] } = body;

    // 簡單的安全驗證（你可以設定環境變數）
    const expectedSecret = process.env.CACHE_REFRESH_SECRET || "your-secret-key";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 統一快取架構：所有 API 都使用 Vercel Cache
    // 
    // 之前的 Simple Cache 在 Vercel serverless 環境中不會持久化，
    // 導致 cronjob 的 revalidateTag() 對 run-csv API 無效。
    // 
    // 現在所有 API 都使用 createVercelCache，確保：
    // 1. 快取在 Vercel 上持久化
    // 2. revalidateTag() 對所有 API 都有效
    // 3. cronjob 能完全清除和重新生成快取
    console.log(`[Cache Refresh] Starting cache refresh for projects`);

    const refreshedTags = [];
    const refreshedUrls = [];
    
    // 獲取專案列表
    let allProjects = [];
    try {
      const projectsRes = await fetch(`${req.nextUrl.origin}/api/data/projects`, {
        cache: "no-store"
      });
      
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        allProjects = Array.isArray(projectsData?.projects) 
          ? projectsData.projects 
          : Array.isArray(projectsData) 
          ? projectsData 
          : [];
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      return NextResponse.json({ 
        error: "Failed to fetch projects",
        details: error.message 
      }, { status: 500 });
    }

    // 決定要處理的專案
    const targetProjects = Array.isArray(projectIds) && projectIds.length > 0
      ? allProjects.filter(p => projectIds.includes(p.id))
      : allProjects;

    if (!targetProjects.length) {
      return NextResponse.json({ 
        error: "No projects found to refresh" 
      }, { status: 400 });
    }

    // 為每個專案和每個天數組合刷新快取
    for (const project of targetProjects) {
      if (!project?.id) continue;

      // 先清除該專案的所有 Redis 快取（只清除一次）
      await invalidateCachePattern(`run-csv:${project.id}:*`);
      await invalidateCachePattern(`page-metrics:${project.id}:*`);

      // 然後為每個天數建立新的快取
      for (const dayCount of days) {
        refreshedTags.push(`run-csv:${project.id}:${dayCount}days`, `page-metrics:${project.id}:${dayCount}days`);

        // 預熱快取：實際呼叫 API 來重新產生快取
        try {
          const baseUrl = req.nextUrl.origin;
          const timestamp = Date.now();
          
          // 呼叫 run-csv API
          const runCsvUrl = `${baseUrl}/api/run-csv/${encodeURIComponent(project.id)}?days=${dayCount}&refresh=1&_t=${timestamp}`;
          const runCsvPromise = fetch(runCsvUrl, { cache: "no-store" });
          
          // 呼叫 page-metrics API  
          const pageMetricsUrl = `${baseUrl}/api/page-metrics/${encodeURIComponent(project.id)}?days=${dayCount}&refresh=1&_t=${timestamp}`;
          const pageMetricsPromise = fetch(pageMetricsUrl, { cache: "no-store" });
          
          // 並行執行兩個請求
          await Promise.all([runCsvPromise, pageMetricsPromise]);
          
          refreshedUrls.push(runCsvUrl, pageMetricsUrl);
          
        } catch (error) {
          console.error(`Failed to warm cache for ${project.id} (${dayCount} days):`, error);
          // 繼續處理其他專案，不要因為一個失敗就停止
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cache refreshed for ${targetProjects.length} projects with ${days.length} day periods each`,
      refreshedTags,
      refreshedUrls,
      projects: targetProjects.map(p => p.id),
      days,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Cache refresh error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
});

// 也支援 GET 請求，方便測試
export const GET = requireAdmin(async (req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const projectIds = url.searchParams.get("projectIds")?.split(",").filter(Boolean);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? daysParam.split(",").map(d => parseInt(d.trim())).filter(d => !isNaN(d)) : [7, 30, 60];

  return POST({
    json: async () => ({ secret, projectIds, days }),
    nextUrl: req.nextUrl
  });
});