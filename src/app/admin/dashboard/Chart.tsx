"use client";

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

const COLORS = ["#00D8FF", "#FF5C8D", "#FFD500", "#82ca9d", "#8884d8"];

export default function Chart({
  type,
  data,
  dataKey = "value",
  nameKey = "name",
  valueKey = "value",
  colorScheme = COLORS,
}: ChartProps) {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" && (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey={nameKey} stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }} />
            <Legend />
            <Line type="monotone" dataKey={dataKey} stroke="#00D8FF" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        )}

        {type === "bar" && (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey={nameKey} stroke="#ccc" />
            <YAxis stroke="#ccc" />
            <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }} />
            <Legend />
            <Bar dataKey={dataKey} fill="#FF5C8D" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}

        {type === "pie" && (
          <PieChart>
            <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }} />
            <Legend />
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={nameKey}
              outerRadius={100}
              innerRadius={40}
              label
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colorScheme[index % colorScheme.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
