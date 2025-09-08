import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "app", "data");
const CACHE_DIR = path.join(DATA_DIR, "_cache");
const UPSTREAM = "https://unbiased-remarkably-arachnid.ngrok-free.app/api/query";
const ONE_HOUR_MS = 60 * 60 * 1000;

function bad(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function validateId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

async function readJSON(file) {
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

export async function GET(_req, { params }) {
  try {
    const p = await params;
    const id = p?.id;
    if (!validateId(id)) return bad("Invalid id", 400);

    const configPath = path.join(DATA_DIR, `${id}.json`);
    let payload;
    try {
      payload = await readJSON(configPath);
    } catch (e) {
      return bad(`Config not found or invalid JSON: ${id}.json`, 404);
    }

    if (!payload || typeof payload !== "object") return bad("Config JSON must be an object", 400);
    const { data_type, site, sql } = payload;
    if (typeof data_type !== "string" || typeof site !== "string" || typeof sql !== "string") {
      return bad("Config must include string fields: data_type, site, sql", 400);
    }

    // File-based cache
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cachePath = path.join(CACHE_DIR, `${id}.json`);
    try {
      const cache = await readJSON(cachePath);
      const age = Date.now() - Number(cache?.ts || 0);
      if (Number.isFinite(age) && age >= 0 && age < ONE_HOUR_MS && cache?.data) {
        return NextResponse.json(cache.data, {
          status: 200,
          headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
        });
      }
    } catch { /* no cache, continue */ }

    // Fetch fresh from upstream
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data_type, site, sql }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `Upstream error ${res.status}`, details: text.slice(0, 4000) }, { status: 502 });
    }

    const data = await res.json();
    // Save cache
    await fs.writeFile(cachePath, JSON.stringify({ ts: Date.now(), data }, null, 2), "utf8");

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
