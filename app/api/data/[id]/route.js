import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

const DATA_DIR = path.join(process.cwd(), "app", "data");

function validateId(id) {
  // allow a-z A-Z 0-9 _ - only
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

export async function GET(_req, { params }) {
  try {
    const p = await params;
    const { id } = p || {};
    if (!validateId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const filePath = path.join(DATA_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, "utf8");
    // parse once to ensure valid JSON before returning
    const json = JSON.parse(content);
    return NextResponse.json(json, { status: 200 });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const p = await params;
    const { id } = p || {};
    if (!validateId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    // Ensure body is JSON
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
    }

    // Ensure data directory exists (created by repo, but safe to mkdir)
    await fs.mkdir(DATA_DIR, { recursive: true });
    const filePath = path.join(DATA_DIR, `${id}.json`);
    const serialized = JSON.stringify(body, null, 2);
    await fs.writeFile(filePath, serialized, "utf8");

    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (_err) {
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}
