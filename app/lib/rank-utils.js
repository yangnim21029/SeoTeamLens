export const MAX_VISIBLE_RANK = 40;
export const MIN_IMPRESSIONS_FOR_TOP = 5;

function extractArticleId(url) {
  if (typeof url !== "string") return null;
  const m = url.match(/\/article\/(\d+)/);
  return m ? m[1] : null;
}

export const clampRank = (r) =>
  r == null ? null : Math.min(r, MAX_VISIBLE_RANK);
export const fmtRank = (r) =>
  r == null || r > MAX_VISIBLE_RANK ? "N/A" : `#${r}`;
export const safeRank = (v) =>
  v == null || v > MAX_VISIBLE_RANK ? MAX_VISIBLE_RANK + 1 : v;
export const latestDefinedRank = (series = []) => {
  for (let i = series.length - 1; i >= 0; i--) {
    const value = series[i];
    if (value != null) return value;
  }
  return null;
};

export const trendDelta = (start, end) => {
  const s = safeRank(start);
  const e = safeRank(end);
  return s - e; // positive => improved (smaller rank)
};

export function isDropFromTopN(start, end, n) {
  const s = safeRank(start);
  const e = safeRank(end);
  return s <= n && e > n;
}

export function mergeHistory(a = [], b = []) {
  const len = Math.max(a.length, b.length);
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    const va = ai == null ? 120 : ai;
    const vb = bi == null ? 120 : bi;
    const best = Math.min(va, vb);
    out[i] = ai == null && bi == null ? null : best;
  }
  return out;
}

export function dedupeRows(rows) {
  const map = new Map();
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim();
  rows.forEach((r) => {
    const key = `${norm(r.keyword)}__${norm(r.displayUrl)}`;
    if (!map.has(key)) {
      map.set(key, { ...r });
    } else {
      const cur = map.get(key);
      cur.history = mergeHistory(cur.history, r.history);
      if (String(r.keyword || "").length < String(cur.keyword || "").length) {
        cur.keyword = r.keyword;
      }
      map.set(key, cur);
    }
  });
  return Array.from(map.values()).map((row) => {
    const history = Array.isArray(row.history) ? row.history : [];
    const filled = fillExteriorGaps(fillInteriorGaps(history));
    return { ...row, history: filled };
  });
}

export function fillInteriorGaps(series = []) {
  const out = Array.from(series);
  let lastIdx = -1;
  let lastVal = null;
  for (let i = 0; i < out.length; i++) {
    const currentVal = out[i];
    if (currentVal == null) continue;
    if (lastIdx !== -1 && lastVal != null) {
      const gapLen = i - lastIdx;
      if (gapLen > 1) {
        for (let step = 1; step < gapLen; step++) {
          const ratio = step / gapLen;
          const interpolated = Math.round(
            lastVal + (currentVal - lastVal) * ratio,
          );
          out[lastIdx + step] = Math.max(
            1,
            Math.min(MAX_VISIBLE_RANK, interpolated),
          );
        }
      }
    }
    const clamped = Math.max(1, Math.min(MAX_VISIBLE_RANK, currentVal));
    out[i] = clamped;
    lastIdx = i;
    lastVal = clamped;
  }
  return out;
}

export function fillExteriorGaps(series = []) {
  const out = Array.from(series);
  let lastSeen = null;
  for (let i = out.length - 1; i >= 0; i--) {
    const value = out[i];
    if (value == null) continue;
    lastSeen = value;
    break;
  }
  if (lastSeen != null) {
    for (let i = out.length - 1; i >= 0 && out[i] == null; i--) {
      out[i] = lastSeen;
    }
  }

  return out;
}

export function aggregateByUrl(rows, windowDays) {
  const map = new Map();
  rows.forEach((r) => {
    const windowHistRaw = r.history
      .slice(-windowDays)
      .map((v) => (v == null ? null : Math.min(v, MAX_VISIBLE_RANK)));
    const windowHist = fillExteriorGaps(fillInteriorGaps(windowHistRaw));
    const start = windowHist[0];
    const end = latestDefinedRank(windowHist);
    const delta = trendDelta(start, end);
    const item = { ...r, windowHist, start, end, delta };
    if (!map.has(r.displayUrl)) map.set(r.displayUrl, []);
    map.get(r.displayUrl).push(item);
  });

  const urlRows = Array.from(map.entries()).map(([url, items]) => {
    const days = items[0].windowHist.length;
    const aggRaw = Array.from({ length: days }, (_, i) => {
      let best = MAX_VISIBLE_RANK;
      let seen = false;
      items.forEach((it) => {
        const v = it.windowHist[i];
        if (v == null) return;
        seen = true;
        best = Math.min(best, v);
      });
      return seen ? best : null;
    });
    
    // 檢查是否有任何真實資料
    const hasAnyData = aggRaw.some(v => v !== null);
    const agg = hasAnyData ? fillExteriorGaps(fillInteriorGaps(aggRaw)) : aggRaw;

    const avgCurrentRaw =
      items.reduce((acc, it) => acc + safeRank(it.end), 0) / items.length;
    const avgCurrentRounded = Math.round(avgCurrentRaw);
    const avgCurrent =
      avgCurrentRounded > MAX_VISIBLE_RANK ? null : avgCurrentRounded;
    const improved = items.filter((it) => it.delta > 0).length;
    const declined = items.filter((it) => it.delta < 0).length;
    const inTop10 = items.filter((it) => it.end != null && it.end <= 10).length;

    return {
      displayUrl: url,
      items,
      aggSpark: agg,
      avgCurrent,
      improved,
      declined,
      total: items.length,
      inTop10,
    };
  });

  return urlRows;
}

export function safeDecodeURL(u) {
  if (!u || typeof u !== "string") return u;
  try {
    return decodeURI(u);
  } catch {}
  try {
    return decodeURIComponent(u);
  } catch {}
  return u;
}

export function buildRowsFromResults(results, days, requestedPairs = []) {
  const today = new Date();
  const baseUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const anchorUTC = baseUTC - 24 * 60 * 60 * 1000; // yesterday
  const dateIndex = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchorUTC);
    d.setUTCDate(d.getUTCDate() - i);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    dateIndex.set(label, days - 1 - i);
  }

  const map = new Map();
  for (const p of requestedPairs) {
    const page = p.page;
    const queryStr = p.query;
    if (!page || !queryStr) continue;
    const key = `${page}||${queryStr}`;
    if (!map.has(key)) {
      map.set(key, {
        keyword: queryStr,
        displayUrl: page,
        history: Array.from({ length: days }, () => null),
      });
    }
  }
  // 建立 article ID 到 canonical URL 的映射
  const articleIdToCanonical = new Map();
  for (const [key, record] of map.entries()) {
    const articleId = extractArticleId(record.displayUrl);
    if (articleId) {
      articleIdToCanonical.set(articleId, record.displayUrl);
    }
  }

  for (const row of Array.isArray(results) ? results : []) {
    const dateVal = row["CAST(date AS DATE)"] || row.date || row.dt;
    const page = row.page;
    const queryStr = row.query;
    const pos = Number.parseFloat(row.avg_position);
    const impressions = Number(
      row.impressions ??
        row.total_impressions ??
        row.sum_impressions ??
        row.impr,
    );
    if (!dateVal || !page || !queryStr || !Number.isFinite(pos)) continue;
    if (
      Math.round(pos) === 1 &&
      Number.isFinite(impressions) &&
      impressions > 0 &&
      impressions < MIN_IMPRESSIONS_FOR_TOP
    )
      continue;
    const d = new Date(dateVal);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const idx = dateIndex.get(label);
    if (idx == null) continue;
    
    // 嘗試通過 article ID 找到 canonical URL
    const articleId = extractArticleId(page);
    const canonicalUrl = articleId ? articleIdToCanonical.get(articleId) : null;
    const targetUrl = canonicalUrl || page;
    
    const key = `${targetUrl}||${queryStr}`;
    if (!map.has(key)) {
      // 如果找不到 canonical URL 的記錄，嘗試直接使用原始 URL
      const fallbackKey = `${page}||${queryStr}`;
      if (map.has(fallbackKey)) {
        const rec = map.get(fallbackKey);
        const rank = Math.max(1, Math.min(120, Math.round(pos)));
        rec.history[idx] = rank;
        continue;
      }
      
      // 如果都找不到，創建新記錄
      map.set(key, {
        keyword: queryStr,
        displayUrl: targetUrl,
        history: Array.from({ length: days }, () => null),
      });
    }
    const rec = map.get(key);
    const rank = Math.max(1, Math.min(120, Math.round(pos)));
    rec.history[idx] = rank;
  }
  return Array.from(map.values()).map((row) => {
    const history = Array.isArray(row.history) ? row.history : [];
    const filled = fillExteriorGaps(fillInteriorGaps(history));
    return { ...row, history: filled };
  });
}

export function buildTrafficTimeline(results = [], days = 0) {
  const len = Number.isFinite(days) && days > 0 ? Number(days) : 0;
  if (!len) return [];

  const today = new Date();
  const baseUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const anchorUTC = baseUTC - 24 * 60 * 60 * 1000;

  const out = new Array(len);
  const dateIndex = new Map();
  for (let i = len - 1; i >= 0; i--) {
    const d = new Date(anchorUTC);
    d.setUTCDate(d.getUTCDate() - i);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const fullDate = `${year}-${month}-${day}`;
    const idx = len - 1 - i;
    out[idx] = {
      date: `${month}/${day}`,
      fullDate,
      impressions: 0,
      clicks: 0,
    };
    dateIndex.set(fullDate, idx);
  }

  results.forEach((row) => {
    if (!row) return;
    const dateVal = row["CAST(date AS DATE)"] || row.date || row.dt;
    if (!dateVal) return;
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return;
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const idx = dateIndex.get(label);
    if (idx == null) return;

    const impressions = Number(
      row.impressions ??
        row.total_impressions ??
        row.sum_impressions ??
        row.impr,
    );
    if (Number.isFinite(impressions)) {
      out[idx].impressions += impressions;
    }

    const clicks = Number(
      row.clicks ?? row.total_clicks ?? row.sum_clicks ?? row.click,
    );
    if (Number.isFinite(clicks)) {
      out[idx].clicks += clicks;
    }
  });

  return out;
}
