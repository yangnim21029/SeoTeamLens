import { NextResponse } from "next/server";
import { loadProjectSummaries } from "@/app/lib/projects-store";

export async function GET() {
  try {
    const projects = await loadProjectSummaries();
    return NextResponse.json(
      { projects },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load projects from database:", error);
    return NextResponse.json({ error: "Failed to load project metadata." }, { status: 500 });
  }
}
