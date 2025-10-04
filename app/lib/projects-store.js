import { sql } from "@vercel/postgres";
import { createRedisCache, invalidateCache } from "./redis-cache.js";

function extractRecords(json) {
  if (Array.isArray(json)) {
    return json.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }
  if (json && typeof json === "object") {
    if (Array.isArray(json.rows)) {
      return json.rows.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    }
    if (Array.isArray(json.data)) {
      return json.data.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    }
  }
  return [];
}

function sanitizeAndParseJson(raw) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    const sanitized = raw.replace(/[\u0000-\u001F]/g, (char) => {
      const code = char.charCodeAt(0).toString(16).padStart(4, "0");
      return `\\u${code}`;
    });
    try {
      return JSON.parse(sanitized);
    } catch (finalError) {
      console.error("Failed to parse project json_data", finalError);
      return null;
    }
  }
}

function parseProjectRow(row) {
  const { sheet_name: sheetName, json_data: jsonData, last_updated: lastUpdated } = row;
  const parsed = sanitizeAndParseJson(jsonData);
  const records = extractRecords(parsed);
  const meta = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.meta ?? null : null;
  const labelCandidate = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim() : null)
    : null;
  return {
    id: sheetName,
    label: labelCandidate || sheetName,
    rows: records,
    meta,
    lastUpdated,
  };
}

// 建立 Redis cache 包裝器
const getCachedProjects = createRedisCache(
  async () => {
    console.log("Refreshing projects cache...");
    try {
      const { rows } = await sql`SELECT sheet_name, json_data, last_updated FROM synced_data`;
      console.log(`Found ${rows.length} raw rows from database`);

      const projects = rows.map(parseProjectRow).filter((project) => Array.isArray(project.rows));
      console.log(`Cached ${projects.length} valid projects`);

      if (projects.length === 0) {
        console.warn("No valid projects found in database");
      }

      return projects;
    } catch (error) {
      console.error("Error fetching projects from database:", error);
      throw error;
    }
  },
  ['projects'], // cache key
  { ttl: 14400 } // 4 hours
);

async function getProjectsInternal({ force = false } = {}) {
  if (force) {
    // 如果強制刷新，先清除快取
    await invalidateCache(['projects']);
  }
  return await getCachedProjects();
}

export async function loadProjectSummaries() {
  const projects = await getProjectsInternal();
  return projects
    .map(({ rows, lastUpdated, ...rest }) => ({
      ...rest,
      lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null,
      rowCount: Array.isArray(rows) ? rows.length : 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export async function getProjectById(id) {
  if (!id) return null;
  let projects = await getProjectsInternal();
  let match = projects.find((project) => project.id === id);
  if (match) {
    return {
      ...match,
      lastUpdated: match.lastUpdated ? new Date(match.lastUpdated).toISOString() : null,
    };
  }
  projects = await getProjectsInternal({ force: true });
  match = projects.find((project) => project.id === id);
  if (!match) return null;
  return {
    ...match,
    lastUpdated: match.lastUpdated ? new Date(match.lastUpdated).toISOString() : null,
  };
}

export async function invalidateProjectsCache() {
  await invalidateCache(['projects']);
}
