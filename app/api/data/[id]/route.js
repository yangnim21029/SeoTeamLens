import { NextResponse } from "next/server";
import { getProjectById } from "@/app/lib/projects-store";

export async function GET(_req, { params }) {
  const p = await params;
  const { id } = p || {};

  if (!id || typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  try {
    const project = await getProjectById(id.trim());
    if (!project) {
      return NextResponse.json(
        { error: `Data for '${id}' not found.` },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        id: project.id,
        label: project.label,
        rows: project.rows,
        meta: project.meta ?? null,
        lastUpdated: project.lastUpdated ?? null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("Failed to retrieve data from database:", error);
    return NextResponse.json(
      { error: "Internal Server Error: Failed to retrieve data." },
      { status: 500 },
    );
  }
}
