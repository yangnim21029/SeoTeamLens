export const MAX_VISIBLE_RANK = 40;
export const MIN_IMPRESSIONS_FOR_TOP = 5;

export const clampRank = (r) => (r == null ? null : Math.min(r, MAX_VISIBLE_RANK));
export const fmtRank = (r) => (r == null || r > MAX_VISIBLE_RANK ? "N/A" : `#${r}`);
export const safeRank = (v) => (v == null || v > MAX_VISIBLE_RANK ? MAX_VISIBLE_RANK + 1 : v);

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
    out[i] = (ai == null && bi == null) ? null : best;
  }
  return out;
}

export function dedupeRows(rows) {
  const map = new Map();
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
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
  return Array.from(map.values());
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
          const interpolated = Math.round(lastVal + (currentVal - lastVal) * ratio);
          out[lastIdx + step] = Math.max(1, Math.min(MAX_VISIBLE_RANK, interpolated));
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

export function aggregateByUrl(rows, windowDays) {
  const map = new Map();
  rows.forEach((r) => {
    const windowHistRaw = r.history.slice(-windowDays).map((v) => (v == null ? null : Math.min(v, MAX_VISIBLE_RANK)));
    const windowHist = fillInteriorGaps(windowHistRaw);
    const start = windowHist[0];
    const end = windowHist[windowHist.length - 1];
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
    const agg = fillInteriorGaps(aggRaw);

    const bestCurrentRaw = Math.min(...items.map((it) => safeRank(it.end)));
    const bestCurrent = bestCurrentRaw > MAX_VISIBLE_RANK ? null : bestCurrentRaw;
    const avgCurrentRaw = items.reduce((acc, it) => acc + safeRank(it.end), 0) / items.length;
    const avgCurrentRounded = Math.round(avgCurrentRaw);
    const avgCurrent = avgCurrentRounded > MAX_VISIBLE_RANK ? null : avgCurrentRounded;
    const improved = items.filter((it) => it.delta > 0).length;
    const declined = items.filter((it) => it.delta < 0).length;
    const inTop10 = items.filter((it) => it.end != null && it.end <= 10).length;

    return {
      displayUrl: url,
      items,
      aggSpark: agg,
      bestCurrent,
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
  try { return decodeURI(u); } catch {}
  try { return decodeURIComponent(u); } catch {}
  return u;
}

export function buildRowsFromResults(results, days, requestedPairs = []) {
  const today = new Date();
  const baseUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const anchorUTC = baseUTC - 24 * 60 * 60 * 1000; // yesterday
  const dateIndex = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchorUTC);
    d.setUTCDate(d.getUTCDate() - i);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    dateIndex.set(label, (days - 1) - i);
  }

  const map = new Map();
  for (const p of requestedPairs) {
    const page = p.page;
    const queryStr = p.query;
    if (!page || !queryStr) continue;
    const key = `${page}||${queryStr}`;
    if (!map.has(key)) {
      map.set(key, { keyword: queryStr, displayUrl: page, history: Array.from({ length: days }, () => null) });
    }
  }
  for (const row of Array.isArray(results) ? results : []) {
    const dateVal = row["CAST(date AS DATE)"] || row.date || row.dt;
    const page = row.page;
    const queryStr = row.query;
    const pos = Number.parseFloat(row.avg_position);
    const impressions = Number(row.impressions ?? row.total_impressions ?? row.sum_impressions ?? row.impr);
    if (!dateVal || !page || !queryStr || !Number.isFinite(pos)) continue;
    if (Math.round(pos) === 1 && Number.isFinite(impressions) && impressions > 0 && impressions < MIN_IMPRESSIONS_FOR_TOP) continue;
    const d = new Date(dateVal);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const idx = dateIndex.get(label);
    if (idx == null) continue;
    const key = `${page}||${queryStr}`;
    if (!map.has(key)) {
      map.set(key, { keyword: queryStr, displayUrl: page, history: Array.from({ length: days }, () => null) });
    }
    const rec = map.get(key);
    const rank = Math.max(1, Math.min(120, Math.round(pos)));
    rec.history[idx] = rank;
  }
  return Array.from(map.values());
}
