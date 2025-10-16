"use client";

export default function SectionCard({
  header,
  title,
  subtitle,
  description,
  actions,
  children,
  bodyClassName = "",
  bodyPadding = "px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-6",
}) {
  const hasHeaderContent =
    header || title || subtitle || description || actions;

  const renderHeader = () => {
    if (header) return header;
    if (!title && !subtitle && !description) return null;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {title && (
            <span className="text-base font-semibold text-slate-800 sm:text-lg">
              {title}
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-slate-400">{subtitle}</span>
          )}
        </div>
        {description && (
          <p className="text-xs text-slate-500">{description}</p>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100">
      {hasHeaderContent && (
        <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4 sm:px-8 sm:py-5">
          <div className="min-w-0 flex-1">{renderHeader()}</div>
          {actions ? (
            <div className="ml-3 flex shrink-0 items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      )}
      <div className={`${bodyPadding} ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}
