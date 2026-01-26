"use client";

import type { ReactElement } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from "recharts";

type AnyRow = Record<string, any>;

interface ChartProps {
  type: "line" | "bar" | "pie";
  data: AnyRow[];

  // line/bar
  dataKey?: string; // domyślnie "value"
  nameKey?: string; // domyślnie "name"

  // pie
  valueKey?: string; // domyślnie "value"

  colorScheme?: string[];
  height?: number;

  // opcjonalne formatowanie
  labelFormatter?: (label: any) => string;
  valueFormatter?: (value: any) => string;
  showLegend?: boolean;
}

const COLORS = ["#22d3ee", "#f97373", "#facc15", "#4ade80", "#a855f7"];

const GRID_COLOR = "#1f2937"; // slate-800
const AXIS_COLOR = "#9ca3af"; // slate-400
const LABEL_COLOR = "#e5e7eb"; // slate-200
const TOOLTIP_BG = "#020617"; // slate-950
const TOOLTIP_BORDER = "#334155"; // slate-700

function isISODateLike(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
}

function formatShortDate(iso: string) {
  // "2025-12-13" => "13.12"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatCompactNumber(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function DefaultTooltip({
  active,
  payload,
  label,
  labelText,
  valueText,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  labelText: string;
  valueText: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        backgroundColor: TOOLTIP_BG,
        border: `1px solid ${TOOLTIP_BORDER}`,
        color: LABEL_COLOR,
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 18px 45px rgba(15,23,42,0.7)",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 8 }}>
        {labelText}
      </div>

      {payload.map((p, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: p?.color ?? COLORS[0],
                display: "inline-block",
              }}
            />
            <span style={{ color: "#cbd5e1" }}>
              {p?.name ?? (typeof label === "string" ? label : "Wartość")}
            </span>
          </span>
          <span style={{ fontWeight: 600, color: "#fff" }}>{valueText}</span>
        </div>
      ))}
    </div>
  );
}

export default function Chart({
  type,
  data,
  dataKey = "value",
  nameKey = "name",
  valueKey = "value",
  colorScheme = COLORS,
  height = 260,
  labelFormatter,
  valueFormatter,
  showLegend = false,
}: ChartProps) {
  if (!data || data.length === 0) return <div className="h-[260px] w-full" />;

  const axisTick = { fontSize: 11, fill: AXIS_COLOR };

  const fmtLabel = (raw: any) => {
    if (labelFormatter) return labelFormatter(raw);
    if (isISODateLike(raw)) return formatShortDate(raw);
    return String(raw ?? "");
  };

  const fmtValue = (raw: any) => {
    if (valueFormatter) return valueFormatter(raw);
    return formatCompactNumber(raw);
  };

  const commonXAxis = (
    <XAxis
      dataKey={nameKey}
      tick={axisTick}
      tickFormatter={fmtLabel}
      axisLine={{ stroke: GRID_COLOR }}
      tickLine={{ stroke: GRID_COLOR }}
      minTickGap={14}
      tickMargin={8}
      interval="preserveStartEnd"
    />
  );

  const commonYAxis = (
    <YAxis
      tick={axisTick}
      tickFormatter={fmtValue}
      axisLine={{ stroke: GRID_COLOR }}
      tickLine={{ stroke: GRID_COLOR }}
      allowDecimals={false}
      width={42}
    />
  );

  const renderChart = (): ReactElement => {
    if (type === "line") {
      return (
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} vertical={false} />

          {commonXAxis}
          {commonYAxis}

          <Tooltip
            cursor={{ stroke: GRID_COLOR, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => (
              <DefaultTooltip
                active={active}
                payload={payload}
                label={label}
                labelText={fmtLabel(label)}
                valueText={fmtValue(payload?.[0]?.value)}
              />
            )}
          />

          {showLegend ? (
            <Legend
              wrapperStyle={{
                color: LABEL_COLOR,
                fontSize: 11,
              }}
            />
          ) : null}

          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={colorScheme[0]}
            strokeWidth={3}
            strokeLinecap="round"
            dot={{ r: 2.5, strokeWidth: 2, stroke: TOOLTIP_BG, fill: colorScheme[0] }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      );
    }

    if (type === "bar") {
      return (
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} vertical={false} />

          {commonXAxis}
          {commonYAxis}

          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            content={({ active, payload, label }) => (
              <DefaultTooltip
                active={active}
                payload={payload}
                label={label}
                labelText={fmtLabel(label)}
                valueText={fmtValue(payload?.[0]?.value)}
              />
            )}
          />

          {showLegend ? (
            <Legend
              wrapperStyle={{
                color: LABEL_COLOR,
                fontSize: 11,
              }}
            />
          ) : null}

          <Bar dataKey={dataKey} radius={[10, 10, 2, 2]} isAnimationActive={false}>
            {data.map((_, index) => (
              <Cell key={`bar-${index}`} fill={colorScheme[index % colorScheme.length]} />
            ))}
          </Bar>
        </BarChart>
      );
    }

    // pie
    return (
      <PieChart>
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0];
            const label = p?.name ?? "";
            const value = p?.value ?? 0;
            return (
              <DefaultTooltip
                active={active}
                payload={payload}
                label={label}
                labelText={fmtLabel(label)}
                valueText={fmtValue(value)}
              />
            );
          }}
        />

        {showLegend ? (
          <Legend
            wrapperStyle={{
              color: LABEL_COLOR,
              fontSize: 11,
            }}
          />
        ) : null}

        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          outerRadius={92}
          innerRadius={42}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colorScheme[index % colorScheme.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
