import { NextResponse } from "next/server";
import { invalidateCachePattern } from "@/app/lib/redis-cache";

// 專門給外部 cronjob 使用的快取刷新端點，不需要登入
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { projectIds, secret, days = [7, 30, 60] } = body;

    // 安全驗證：只檢查 secret key，不需要登入
    const expectedSecret = process.env.CACHE_REFRESH_SECRET || "your-secret-key";
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized - Invalid secret" }, { status: 401 });
    }

    console.log(`[Cache Refresh External] Starting cache refresh for projects`);

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

    console.log(`[Cache Refresh External] Processing ${targetProjects.length} projects`);

    // 為每個專案和每個天數組合刷新快取
    for (const project of targetProjects) {
      if (!project?.id) continue;

      for (const dayCount of days) {
        // 清除 Redis 快取
        await invalidateCachePattern(`run-csv:${project.id}:*`);
        await invalidateCachePattern(`page-metrics:${project.id}:*`);
        
        refreshedTags.push(`${runCsvTag}:${dayCount}days`, `${pageMetricsTag}:${dayCount}days`);

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

    const response = {
      success: true,
      message: `Cache refreshed for ${targetProjects.length} projects with ${days.length} day periods each`,
      refreshedTags,
      refreshedUrls,
      projects: targetProjects.map(p => p.id),
      days,
      timestamp: new Date().toISOString(),
      source: "external-cronjob"
    };

    console.log(`[Cache Refresh External] Completed successfully:`, {
      projects: response.projects.length,
      urls: response.refreshedUrls.length,
      tags: response.refreshedTags.length
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error("External cache refresh error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 });
  }
}

// 也支援 GET 請求，方便測試
export async function GET(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const projectIds = url.searchParams.get("projectIds")?.split(",").filter(Boolean);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? daysParam.split(",").map(d => parseInt(d.trim())).filter(d => !isNaN(d)) : [7, 30, 60];

  return POST({
    json: async () => ({ secret, projectIds, days }),
    nextUrl: req.nextUrl
  });
}