"use client";
import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MAX_VISIBLE_RANK } from "../lib/rank-utils";

const VARIANT_DEFAULT_COLORS = {
  rank: "#0f172a",
  percent: "#0ea5e9",
  metric: "#6366f1",
};

const Sparkline = memo(function Sparkline({
  data,
  className = "h-16 w-40",
  variant = "rank",
  color,
  valueFormatter,
  secondaryData,
  secondaryVariant,
  secondaryColor,
  secondaryFormatter,
}) {
  const len = Array.isArray(data) ? data.length : 0;
  const hasSecondary =
    Array.isArray(secondaryData) && secondaryData.length === len;
  const now = new Date();
  const baseUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const anchorUTC = baseUTC - 24 * 60 * 60 * 1000; // yesterday

  const effectiveSecVariant = secondaryVariant || variant;

  const normalizeValue = (raw, mode) => {
    let value = Number(raw);
    if (!Number.isFinite(value)) return null;
    if (mode === "rank") {
      return Math.max(1, Math.min(MAX_VISIBLE_RANK, Math.round(value)));
    }
    if (mode === "percent") {
      return Number(value.toFixed(1));
    }
    return Number(value);
  };

  const series = useMemo(() => {
    if (!len) return [];
    return data.map((raw, i) => {
      const d = new Date(anchorUTC);
      d.setUTCDate(d.getUTCDate() - (len - 1 - i));
      const label = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
      const primary = normalizeValue(raw, variant);
      const secondary = hasSecondary
        ? normalizeValue(secondaryData[i], effectiveSecVariant)
        : null;
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const weekday = d.getUTCDay();
      return { primary, secondary, date: label, isoDate: iso, weekday };
    });
  }, [
    data,
    anchorUTC,
    len,
    variant,
    hasSecondary,
    secondaryData,
    effectiveSecVariant,
  ]);

  const weekendBands = useMemo(() => {
    if (!series.length) return [];
    const bands = [];
    for (let i = 0; i < series.length; i += 1) {
      const point = series[i];
      if (point.weekday === 6) {
        const sunday = series[i + 1] ?? point;
        const nextWeekday = series[i + 2] ?? sunday;
        bands.push({
          key: `${point.isoDate}-weekend`,
          start: point.date,
          end: nextWeekday.date,
        });
      } else if (point.weekday === 0) {
        const prev = series[i - 1];
        if (!prev || prev.weekday !== 6) {
          const nextPoint = series[i + 1] ?? point;
          bands.push({
            key: `${point.isoDate}-sunday`,
            start: point.date,
            end: nextPoint.date,
          });
        }
      }
    }
    return bands;
  }, [series]);

  const numericPrimary = useMemo(
    () =>
      series
        .map((row) => row.primary)
        .filter((v) => v != null && Number.isFinite(v)),
    [series],
  );
  const numericSecondary = useMemo(
    () =>
      series
        .map((row) => row.secondary)
        .filter((v) => v != null && Number.isFinite(v)),
    [series],
  );

  const lineColor =
    color || VARIANT_DEFAULT_COLORS[variant] || VARIANT_DEFAULT_COLORS.metric;
  const lineSecondaryColor =
    secondaryColor || VARIANT_DEFAULT_COLORS[effectiveSecVariant] || "#94a3b8";
  const gradientIdPrimary = useMemo(
    () => `spark-${variant}-primary-${Math.random().toString(36).slice(2)}`,
    [variant],
  );
  const gradientIdSecondary = useMemo(
    () => `spark-${variant}-secondary-${Math.random().toString(36).slice(2)}`,
    [variant],
  );

  const defaultFormatter = useMemo(() => {
    if (variant === "rank") return (v) => `Rank: ${v}`;
    if (variant === "percent") return (v) => `${v}%`;
    return (v) => Number(v).toLocaleString();
  }, [variant]);

  const formatter = valueFormatter || defaultFormatter;
  const secondaryFmt = useMemo(() => {
    if (secondaryFormatter) return secondaryFormatter;
    if (effectiveSecVariant === "rank") return (v) => `Rank: ${v}`;
    if (effectiveSecVariant === "percent") return (v) => `${v}%`;
    return (v) => Number(v).toLocaleString();
  }, [secondaryFormatter, effectiveSecVariant]);

  if (!len || !series.length || !numericPrimary.length) {
    // Nothing meaningful to draw - show "no data" message
    return (
      <div className={`${className} flex items-center justify-center text-xs text-slate-400`}>
        無資料
      </div>
    );
  }

  let yDomain;
  let yReversed = false;
  if (variant === "rank") {
    yDomain = [1, MAX_VISIBLE_RANK];
    yReversed = true;
  } else if (variant === "percent") {
    yDomain = [0, 100];
  } else {
    const allValues = numericSecondary.length
      ? numericPrimary.concat(numericSecondary)
      : numericPrimary;
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const span = max - min;
    const padding =
      span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : Math.abs(span) * 0.1;
    let lower = min - padding;
    let upper = max + padding;
    if (lower === upper) {
      lower -= 1;
      upper += 1;
    }
    yDomain = [lower, upper];
  }

  if (variant === "rank") {
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          >
            <YAxis hide domain={yDomain} reversed={yReversed} />
            <XAxis dataKey="date" hide />
            <ReferenceArea
              y1={1}
              y2={10.001}
              fill="#94a3b8"
              fillOpacity={0.28}
            />
            <ReferenceArea
              y1={10.001}
              y2={30.001}
              fill="#cbd5e1"
              fillOpacity={0.22}
            />
            <ReferenceLine
              y={10}
              stroke="#64748b"
              strokeDasharray="4 4"
              strokeOpacity={0.8}
              ifOverflow="extendDomain"
            />
            <ReferenceLine
              y={30}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
              ifOverflow="extendDomain"
            />
            <CartesianGrid
              horizontal
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.2}
            />
            {weekendBands.map((band) => (
              <ReferenceArea
                key={band.key}
                x1={band.start}
                x2={band.end}
                fill="rgba(148, 163, 184, 0.18)"
                ifOverflow="extendDomain"
              />
            ))}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const { value, payload: row } = payload[0];
                const secondaryPoint = payload.find(
                  (item) => item.dataKey === "secondary",
                );
                return (
                  <div className="rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow">
                    <div>{row.date}</div>
                    <div>{formatter(value)}</div>
                    {secondaryPoint && secondaryPoint.value != null && (
                      <div>{secondaryFmt(secondaryPoint.value)}</div>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="primary"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              stroke={lineColor}
            />
            {hasSecondary && (
              <Line
                type="monotone"
                dataKey="secondary"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
                stroke={lineSecondaryColor}
                strokeDasharray={
                  variant === "percent" || effectiveSecVariant === "percent"
                    ? "4 4"
                    : undefined
                }
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={series}
          margin={{ top: 2, right: 4, bottom: 4, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientIdPrimary} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.6} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0.05} />
            </linearGradient>
            {hasSecondary && (
              <linearGradient
                id={gradientIdSecondary}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={lineSecondaryColor}
                  stopOpacity={0.45}
                />
                <stop
                  offset="95%"
                  stopColor={lineSecondaryColor}
                  stopOpacity={0.05}
                />
              </linearGradient>
            )}
          </defs>
          <YAxis hide domain={yDomain} />
          <XAxis dataKey="date" hide />
          <CartesianGrid vertical={false} horizontal={false} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const { value, payload: row } = payload[0];
              const secondaryPoint = payload.find(
                (item) => item.dataKey === "secondary",
              );
              return (
                <div className="rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow">
                  <div>{row.date}</div>
                  <div>{formatter(value)}</div>
                  {secondaryPoint && secondaryPoint.value != null && (
                    <div>{secondaryFmt(secondaryPoint.value)}</div>
                  )}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="primary"
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#${gradientIdPrimary})`}
            fillOpacity={1}
            connectNulls
            isAnimationActive={false}
          />
          {hasSecondary && (
            <Area
              type="monotone"
              dataKey="secondary"
              stroke={lineSecondaryColor}
              strokeWidth={1.25}
              fill={`url(#${gradientIdSecondary})`}
              fillOpacity={1}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default Sparkline;
