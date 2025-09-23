"use client";
import { memo, useMemo } from "react";
import {
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

const Sparkline = memo(function Sparkline({ data, className = "h-16 w-40" }) {
  const len = data.length;
  const now = new Date();
  const baseUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const anchorUTC = baseUTC - 24 * 60 * 60 * 1000; // yesterday
  const series = useMemo(() => data.map((v, i) => {
    const val = v == null || v > MAX_VISIBLE_RANK ? MAX_VISIBLE_RANK : v;
    const d = new Date(anchorUTC);
    d.setUTCDate(d.getUTCDate() - (len - 1 - i));
    const label = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
    return { v: val, date: label };
  }), [data, anchorUTC, len]);

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={[1, MAX_VISIBLE_RANK]} reversed />
          <XAxis dataKey="date" hide />
          <ReferenceArea y1={1} y2={10.001} fill="#94a3b8" fillOpacity={0.28} />
          <ReferenceArea y1={10.001} y2={30.001} fill="#cbd5e1" fillOpacity={0.22} />
          <ReferenceLine y={10} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.8} ifOverflow="extendDomain" />
          <ReferenceLine y={30} stroke="#94a3b8" strokeDasharray="4 4" strokeOpacity={0.7} ifOverflow="extendDomain" />
          <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" opacity={0.2} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const { value, payload: row } = payload[0];
              return (
                <div className="rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow">
                  <div>{row.date}</div>
                  <div>Rank: {value}</div>
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="v" dot={false} strokeWidth={2} isAnimationActive={false} stroke="#0f172a" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default Sparkline;
