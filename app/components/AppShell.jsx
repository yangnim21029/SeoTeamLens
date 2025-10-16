"use client";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, ListTree, RefreshCcw, ShieldAlert, Share2, Table2, UsersRound, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRankData } from "../context/rank-data";
import { useAuth } from "../context/auth-context";
import UserMenu from "./UserMenu";
import AuthGuard from "./AuthGuard";

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
  const { isAdmin } = useAuth();

  const navSections = useMemo(() => {
    const sections = [
      {
        id: "reporting",
        label: "成效報表",
        items: [
          { href: "/", icon: Table2, label: "URL 檢視" },
          { href: "/kw-overview", icon: LayoutDashboard, label: "關鍵字概覽" },
          { href: "/edit-overview", icon: UsersRound, label: "作者成效" },
        ],
      },
      {
        id: "sharing",
        label: "分享與管理",
        items: [{ href: "/share", icon: Share2, label: "分享報表" }],
      },
    ];
    if (isAdmin) {
      sections[1].items.push({
        href: "/admin",
        icon: ShieldAlert,
        label: "專案管理",
      });
    }
    return sections;
  }, [isAdmin]);

  const isActivePath = useCallback(
    (href) =>
      pathname === href || (href !== "/" && pathname.startsWith(href)),
    [pathname],
  );

  const [openSections, setOpenSections] = useState(() => {
    const initial = new Set();
    navSections.forEach((section) => initial.add(section.id));
    return initial;
  });

  useEffect(() => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      navSections.forEach((section) => {
        if (!prev.has(section.id)) {
          next.add(section.id);
        }
        if (section.items.some((item) => isActivePath(item.href))) {
          next.add(section.id);
        }
      });
      return next;
    });
  }, [navSections, isActivePath]);

  const toggleSection = (id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 如果是登入頁面，不需要認證保護
  if (pathname === '/login') {
    return children;
  }

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-x-hidden bg-slate-100/60 text-slate-900">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white/95 sm:flex sm:flex-col sm:sticky sm:top-0 sm:h-screen">
          <div className="flex-1 overflow-y-auto px-4 pb-6 pt-6">
            <nav className="flex flex-col gap-4">
              {navSections.map((section) => {
                const open = openSections.has(section.id);
                return (
                  <div key={section.id} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key={`${section.id}-items`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1 pl-1">
                            {section.items.map((item) => {
                              const Icon = item.icon;
                              const active = isActivePath(item.href);
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                                    active
                                      ? "bg-slate-900 text-white shadow-sm"
                                      : "text-slate-600 hover:bg-slate-100"
                                  }`}
                                >
                                  {Icon && (
                                    <Icon
                                      className={`h-4 w-4 ${
                                        active ? "text-white" : "text-slate-400"
                                      }`}
                                    />
                                  )}
                                  <span className="truncate">{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
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
          <main className="relative flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-4 pb-8 pt-4 sm:px-6 lg:px-10">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
        <LoadingOverlay active={loading} />
      </div>
    </AuthGuard>
  );
}

function TopHeader({
  projectId,
  setProjectId,
  projects,
  windowDays,
  setWindowDays,
  triggerRefresh,
  loading,
  activeProject,
}) {
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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ListTree className="h-3.5 w-3.5" /> RankLens
          </div>
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
            {[7, 30, 60].map((d) => (
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
            <RefreshCcw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

const ProjectDropdown = forwardRef(function ProjectDropdown(
  { open, setOpen, projectId, setProjectId, projects, activeProject },
  ref,
) {
  const [query, setQuery] = useState("");
  const formatTimestamp = (value) => {
    if (!value) return '未同步';
    try {
      return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return value;
    }
  };

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredProjects = useMemo(() => {
    if (!Array.isArray(projects)) return [];
    const text = query.trim().toLowerCase();
    if (!text) return projects;
    return projects.filter((p) => {
      const label = (p.label || "").toLowerCase();
      const id = (p.id || "").toLowerCase();
      return label.includes(text) || id.includes(text);
    });
  }, [projects, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex flex-col text-left leading-tight">
          <span>{activeProject?.label || "選擇專案"}</span>
          {activeProject && (
            <span className="text-xs font-normal text-slate-400">
              {formatTimestamp(activeProject.lastUpdated)}
              {typeof activeProject.rowCount === 'number'
                ? ` · ${activeProject.rowCount} 筆`
                : ''}
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 transform transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 8L10 12L14 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            role="listbox"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋專案或 ID"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div className="max-h-64 overflow-auto">
              {filteredProjects.length ? (
                filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProjectId(p.id);
                      setOpen(false);
                    }}
                    className={`block w-full px-4 py-2 text-left text-sm transition ${
                      projectId === p.id
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                    role="option"
                    aria-selected={projectId === p.id}
                  >
                    <span className="block font-medium">{p.label}</span>
                    <span className="block text-xs font-normal opacity-80">
                      {formatTimestamp(p.lastUpdated)}
                      {typeof p.rowCount === 'number' ? ` · ${p.rowCount} 筆` : ''}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  找不到符合的專案
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function LoadingOverlay({ active }) {
  const petals = useMemo(() => Array.from({ length: 6 }, (_, idx) => idx), []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <div className="absolute inset-0 bg-white/75 backdrop-blur-sm" />
          <motion.div
            className="relative z-10 flex flex-col items-center gap-6"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="relative h-20 w-20">
              {petals.map((idx) => {
                const rotation = idx * 60;
                return (
                  <motion.span
                    // `rotation` keeps each petal's transform stable across renders
                    key={rotation}
                    className="absolute left-1/2 top-1/2 h-8 w-[6px] -translate-x-1/2 -translate-y-full origin-[50%_95%] rounded-full bg-slate-400/50 shadow-[0_8px_16px_rgba(15,23,42,0.12)]"
                    style={{ transform: `rotate(${rotation}deg)` }}
                    animate={{
                      scaleY: [0.6, 1.3, 0.6],
                      opacity: [0.35, 1, 0.35],
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: idx * 0.12,
                      ease: "easeInOut",
                    }}
                  />
                );
              })}
              <motion.span
                className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200/80 bg-white/90 shadow-[0_0_20px_rgba(148,163,184,0.45)]"
                animate={{
                  scale: [0.92, 1.05, 0.92],
                  opacity: [0.85, 1, 0.85],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.span
                className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200/60"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <div className="text-sm font-medium tracking-wide text-slate-600">
              正在整理最新資料…
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
