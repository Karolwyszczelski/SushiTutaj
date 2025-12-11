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

interface ChartProps {
  type: "line" | "bar" | "pie";
  data: any[];
  dataKey?: string;
  nameKey?: string;
  valueKey?: string;
  colorScheme?: string[];
}

const COLORS = ["#22d3ee", "#f97373", "#facc15", "#4ade80", "#a855f7"];

const GRID_COLOR = "#1f2937";    // slate-800
const AXIS_COLOR = "#9ca3af";    // slate-400
const LABEL_COLOR = "#e5e7eb";   // slate-200
const TOOLTIP_BG = "#020617";    // slate-950
const TOOLTIP_BORDER = "#334155"; // slate-700

export default function Chart({
  type,
  data,
  dataKey = "value",
  nameKey = "name",
  valueKey = "value",
  colorScheme = COLORS,
}: ChartProps) {
  const axisTick = {
    fontSize: 11,
    fill: AXIS_COLOR,
  };

  const tooltipStyle = {
    backgroundColor: TOOLTIP_BG,
    borderColor: TOOLTIP_BORDER,
    color: LABEL_COLOR,
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 18px 45px rgba(15,23,42,0.7)",
  };

  const legendStyle = {
    color: LABEL_COLOR,
    fontSize: 11,
  } as const;

  const renderChart = (): ReactElement => {
    if (!data || data.length === 0) {
      // brak danych ogarnia komponent-rodzic
      return <></>;
    }

    if (type === "line") {
      return (
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            stroke={GRID_COLOR}
            vertical={false}
          />
          <XAxis
            dataKey={nameKey}
            tick={axisTick}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={{ stroke: GRID_COLOR }}
          />
          <YAxis
            tick={axisTick}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={{ stroke: GRID_COLOR }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: LABEL_COLOR, fontSize: 12 }}
          />
          <Legend wrapperStyle={legendStyle} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={COLORS[0]}
            strokeWidth={3}
            dot={{
              r: 4,
              strokeWidth: 2,
              stroke: "#020617",
              fill: COLORS[0],
            }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      );
    }

    if (type === "bar") {
      return (
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            stroke={GRID_COLOR}
            vertical={false}
          />
          <XAxis
            dataKey={nameKey}
            tick={axisTick}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={{ stroke: GRID_COLOR }}
          />
          <YAxis
            tick={axisTick}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={{ stroke: GRID_COLOR }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: LABEL_COLOR, fontSize: 12 }}
          />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey={dataKey} radius={[8, 8, 0, 0]}>
            {data.map((_, index) => (
              <Cell
                key={`bar-${index}`}
                fill={colorScheme[index % colorScheme.length]}
              />
            ))}
          </Bar>
        </BarChart>
      );
    }

    // type === "pie"
    return (
      <PieChart>
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: LABEL_COLOR, fontSize: 12 }}
        />
        <Legend wrapperStyle={legendStyle} />
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          outerRadius={90}
          innerRadius={40}
          label
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colorScheme[index % colorScheme.length]}
            />
          ))}
        </Pie>
      </PieChart>
    );
  };

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
