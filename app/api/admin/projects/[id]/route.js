import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

import { requireAdmin } from "@/app/lib/auth";
import { invalidateProjectsCache } from "@/app/lib/projects-store";
import { invalidateCachePattern } from "@/app/lib/redis-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = requireAdmin(async (_req, { params }) => {
  const rawId = params?.id;
  if (!rawId || typeof rawId !== "string") {
    return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  }

  const id = rawId.trim();
  if (!id) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  try {
    const result =
      await sql`DELETE FROM synced_data WHERE sheet_name = ${id} RETURNING sheet_name`;

    if (!Array.isArray(result?.rows) || result.rows.length === 0) {
      return NextResponse.json(
        { error: `Project '${id}' not found` },
        { status: 404 },
      );
    }

    // 清除相關快取
    await Promise.all([
      invalidateProjectsCache(),
      invalidateCachePattern(`run-csv:${id}:*`),
      invalidateCachePattern(`page-metrics:${id}:*`),
    ]);

    return NextResponse.json({
      success: true,
      id,
    });
  } catch (error) {
    console.error(`[admin/delete-project] Failed to delete ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
});
