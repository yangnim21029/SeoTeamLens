"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";

import { useAuth } from "../context/auth-context";
import SectionCard from "../components/SectionCard";

const CONFIRM_HINT =
  "此操作會永久刪除資料庫中的專案記錄，且無法復原。請輸入專案 ID 以確認刪除。";

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const SORT_OPTIONS = [
  { value: "desc", label: "依最後同步時間 (新 → 舊)" },
  { value: "asc", label: "依最後同步時間 (舊 → 新)" },
  { value: "label", label: "依名稱 (A → Z)" },
];

function normalizeSortParam(value) {
  if (value === "asc" || value === "desc") return value;
  if (value === "label") return "label";
  return "desc";
}

function toTimestamp(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function sortProjects(list, mode) {
  const copy = [...list];
  if (mode === "asc" || mode === "desc") {
    const sign = mode === "asc" ? 1 : -1;
    return copy.sort((a, b) => {
      const ta = toTimestamp(a.lastUpdated);
      const tb = toTimestamp(b.lastUpdated);
      if (ta == null && tb == null) {
        return a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
        });
      }
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (ta === tb) {
        return a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
        });
      }
      return ta < tb ? -sign : sign;
    });
  }
  return copy.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

export default function AdminProjectPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sortMode, setSortMode] = useState(() =>
    normalizeSortParam(searchParams.get("date")),
  );
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/data/projects", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed with ${res.status}`);
      }
      const json = await res.json();
      const list = Array.isArray(json?.projects)
        ? json.projects
        : Array.isArray(json)
          ? json
          : [];
      const normalized = list
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const id = typeof item.id === "string" ? item.id.trim() : "";
          if (!id) return null;
          return {
            id,
            label:
              typeof item.label === "string" && item.label.trim()
                ? item.label.trim()
                : id,
            rowCount: Number.isFinite(Number(item.rowCount))
              ? Number(item.rowCount)
              : 0,
            lastUpdated:
              typeof item.lastUpdated === "string" && item.lastUpdated.trim()
                ? item.lastUpdated.trim()
                : null,
          };
        })
        .filter(Boolean);
      setProjects(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      void loadProjects();
    }
  }, [authLoading, isAdmin, loadProjects]);

  useEffect(() => {
    const next = normalizeSortParam(searchParams.get("date"));
    setSortMode((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const openConfirm = useCallback((project) => {
    setConfirmTarget(project);
    setConfirmText("");
    setConfirmError("");
  }, []);

  const closeConfirm = useCallback(() => {
    if (submitting) return;
    setConfirmTarget(null);
    setConfirmText("");
    setConfirmError("");
  }, [submitting]);

  const handleDelete = useCallback(async () => {
    if (!confirmTarget) return;
    if (confirmText.trim() !== confirmTarget.id) {
      setConfirmError("請輸入正確的專案 ID 以確認刪除。");
      return;
    }
    setSubmitting(true);
    setConfirmError("");
    try {
      const res = await fetch(
        `/api/admin/projects/${encodeURIComponent(confirmTarget.id)}`,
        { method: "DELETE" },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.error || `Failed to delete (status ${res.status})`,
        );
      }
      setProjects((prev) =>
        prev.filter((item) => item.id !== confirmTarget.id),
      );
      setSuccess(`已刪除專案「${confirmTarget.label}」`);
      setConfirmTarget(null);
      setConfirmText("");
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [confirmTarget, confirmText]);

  const projectCount = useMemo(() => projects.length, [projects]);
  const sortedProjects = useMemo(
    () => sortProjects(projects, sortMode),
    [projects, sortMode],
  );

  const handleSortChange = useCallback(
    (event) => {
      const next = normalizeSortParam(event.target.value);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "desc") {
        params.delete("date");
      } else {
        params.set("date", next);
      }
      router.replace(
        params.size ? `${pathname}?${params.toString()}` : pathname,
        { scroll: false },
      );
      setSortMode(next);
    },
    [pathname, router, searchParams],
  );

  if (authLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        讀取權限中…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-600">
          您沒有存取此頁面的權限。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            專案管理（Admin）
          </h1>
          <p className="text-sm text-slate-500">
            管理目前同步中的專案，刪除將永久移除資料並刷新快取。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500" htmlFor="admin-sort-select">
            排序
          </label>
          <select
            id="admin-sort-select"
            value={sortMode}
            onChange={handleSortChange}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-slate-400 focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadProjects}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "重新載入中…" : "重新載入列表"}
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">刪除注意事項</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>刪除後無法復原，資料庫中的紀錄會被永久移除。</li>
              <li>相關的排名快取將立即失效，使用者需重新載入專案。</li>
              <li>建議先確認該專案不再需要，或已備份相關資料。</li>
            </ul>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          載入失敗：{error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
          {success}
        </div>
      )}

      <SectionCard
        header={
          <div>
            <span className="text-base font-semibold text-slate-800 sm:text-lg">
              專案列表
            </span>
            <span className="ml-2 text-xs text-slate-400">
              {sortMode === "label"
                ? "依名稱排序"
                : sortMode === "asc"
                  ? "依同步時間（舊 → 新）"
                  : "依同步時間（新 → 舊）"}
            </span>
          </div>
        }
        actions={
          <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
            共 {projectCount.toLocaleString()} 個專案
          </div>
        }
      >
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full table-auto border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold text-slate-600">
                  專案
                </th>
                <th className="px-4 py-2 font-semibold text-slate-600">
                  專案 ID
                </th>
                <th className="px-4 py-2 text-right font-semibold text-slate-600">
                  資料筆數
                </th>
                <th className="px-4 py-2 font-semibold text-slate-600">
                  最後同步
                </th>
                <th className="px-4 py-2 text-right font-semibold text-slate-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    載入中…
                  </td>
                </tr>
              ) : projectCount ? (
                sortedProjects.map((project, idx) => (
                  <tr
                    key={project.id}
                    className={`border-t border-slate-100 text-slate-700 transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">
                      {project.label}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        {project.id}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-slate-700">
                      {project.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatTimestamp(project.lastUpdated)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openConfirm(project)}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        刪除
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    尚無任何專案。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-5 w-5" />
              <h2 className="text-lg font-semibold">刪除專案</h2>
            </div>
            <p className="mt-3 text-sm text-slate-600">{CONFIRM_HINT}</p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <div>
                專案：<span className="font-medium">{confirmTarget.label}</span>
              </div>
              <div className="mt-1">
                專案 ID：
                <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                  {confirmTarget.id}
                </code>
              </div>
              <div className="mt-1">
                目前資料筆數：{confirmTarget.rowCount.toLocaleString()}
              </div>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              請輸入專案 ID 確認刪除
            </label>
            <input
              value={confirmText}
              onChange={(event) => {
                setConfirmText(event.target.value);
                setConfirmError("");
              }}
              placeholder={confirmTarget.id}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
              disabled={submitting}
            />
            {confirmError && (
              <div className="mt-2 text-sm text-rose-600">{confirmError}</div>
            )}
            <div className="mt-6 flex justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={closeConfirm}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 font-medium text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? "刪除中…" : "確認刪除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
