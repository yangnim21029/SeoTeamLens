import { NextResponse } from "next/server";

import { getProjectById } from "@/app/lib/projects-store";
import { fetchPageMetricsForProject } from "@/app/lib/page-metrics-service";

export async function GET(req, { params }) {
  try {
    const url = new URL(req.url);
    const p = await params;
    const id = p?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    const project = await getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: `Unknown project id: ${id}` },
        { status: 404 },
      );
    }

    const siteOverride = url.searchParams.get("site");
    const daysParam = Number.parseInt(
      String(url.searchParams.get("days") ?? "").trim(),
      10,
    );
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;
    const refresh = url.searchParams.get("refresh") === "1";
    const limitParam = Number.parseInt(
      String(url.searchParams.get("limit") ?? "").trim(),
      10,
    );
    const limit =
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 0;

    const { payload, duration, cacheKey } = await fetchPageMetricsForProject(
      project,
      {
        days,
        limit,
        refresh,
        siteOverride,
      },
    );

    const safeId = encodeURIComponent(id);

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400",
        "X-Cache-Duration": duration.toString(),
        "X-Cache-Key": cacheKey || `page-metrics:${safeId}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
