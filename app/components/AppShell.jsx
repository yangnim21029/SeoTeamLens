"use client";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, ListTree, RefreshCcw, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, useEffect, useRef, useState } from "react";
import { useRankData } from "../context/rank-data";

const NAV_ITEMS = [
  { href: "/overview", label: "概覽", icon: LayoutDashboard },
  { href: "/", label: "URL 檢視", icon: Table2 },
];

export default function AppShell({ children }) {
  const pathname = usePathname() || "/";
  const {
    projectId,
    setProjectId,
    projects,
    windowDays,
    setWindowDays,
    triggerRefresh,
    loading,
    activeProject,
  } = useRankData();

  return (
    <div className="flex min-h-screen bg-slate-100/60 text-slate-900">
      <aside className="hidden w-16 shrink-0 border-r border-slate-200 bg-white/90 pt-6 sm:flex sm:flex-col sm:items-center sm:gap-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex h-10 w-10 items-center justify-center rounded-xl border bg-white transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white shadow"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              }`}
              title={item.label}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <TopHeader
          projectId={projectId}
          setProjectId={setProjectId}
          projects={projects}
          windowDays={windowDays}
          setWindowDays={setWindowDays}
          triggerRefresh={triggerRefresh}
          loading={loading}
          activeProject={activeProject}
        />
        <main className="flex-1 overflow-auto bg-slate-50 px-4 pb-8 pt-4 sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function TopHeader({ projectId, setProjectId, projects, windowDays, setWindowDays, triggerRefresh, loading, activeProject }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (event) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ListTree className="h-3.5 w-3.5" /> RankLens
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">URL Ranking · 30-Day Tracker</h1>
          <p className="max-w-xl text-sm text-slate-500">快速檢查各 URL 聚合的 30 天名次變化（依最佳名次與趨勢）。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <ProjectDropdown
            ref={ref}
            open={open}
            setOpen={setOpen}
            projectId={projectId}
            setProjectId={setProjectId}
            projects={projects}
            activeProject={activeProject}
          />
          <div className="flex overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  windowDays === d
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
                aria-pressed={windowDays === d}
              >
                {d} 天
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={triggerRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            title="刷新快取"
            aria-label="刷新快取"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </header>
  );
}

const ProjectDropdown = forwardRef(function ProjectDropdown(
  { open, setOpen, projectId, setProjectId, projects, activeProject },
  ref,
) {
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{activeProject?.label || "專案"}</span>
        <svg className={`h-4 w-4 transform transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            role="listbox"
          >
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProjectId(p.id);
                  setOpen(false);
                }}
                className={`block w-full px-4 py-2 text-left text-sm transition ${
                  projectId === p.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                role="option"
                aria-selected={projectId === p.id}
              >
                {p.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
