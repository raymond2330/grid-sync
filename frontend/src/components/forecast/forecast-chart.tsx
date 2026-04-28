"use client";

import { useId, useState } from "react";

import type { ChartColor } from "@/components/forecast/forecast-constants";
import {
  formatDate,
  formatNumber,
  formatPredictionValue,
} from "@/components/forecast/forecast-utils";

export default function ForecastChart({
  data,
  color = "emerald",
}: {
  data: { timestamp: string; value: number }[];
  color?: ChartColor;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const values = data.map((point) => point.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const width = 800;
  const height = 240;
  const paddingX = 50;
  const paddingY = 40;

  const getX = (i: number) => (i / (data.length - 1)) * (width - 2 * paddingX) + paddingX;
  const getY = (val: number) =>
    height - paddingY - ((val - minVal) / range) * (height - 2 * paddingY);

  const points = data.map((point, i) => `${getX(i)},${getY(point.value)}`).join(" ");

  const colorHex =
    color === "emerald"
      ? "#10b981"
      : color === "blue"
        ? "#3b82f6"
        : color === "amber"
          ? "#f59e0b"
          : "#64748b";
  const defId = `gradient-${gradientId}`;

  const defaultYAxisTicks = 5;
  const yTicks = Array.from({ length: defaultYAxisTicks }).map((_, i) =>
    minVal + (range / (defaultYAxisTicks - 1)) * i,
  );

  return (
    <div className="w-full rounded-xl border border-slate-100 bg-slate-50/50 p-4 flex flex-col items-center">
      <div className="relative w-full" onMouseLeave={() => setHoverIndex(null)}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible text-xs font-sans"
          role="img"
          aria-label={`Forecast trend from ${formatDate(data[0].timestamp)} to ${formatDate(data[data.length - 1].timestamp)} (local time)`}
        >
          <defs>
            <linearGradient id={defId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorHex} stopOpacity={0.4} />
              <stop offset="100%" stopColor={colorHex} stopOpacity={0} />
            </linearGradient>
          </defs>

          {yTicks.map((tick, i) => {
            const y = getY(tick);
            return (
              <g key={`y-${i}`}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? "none" : "4 4"}
                />
                <text
                  x={paddingX - 10}
                  y={y}
                  fill="#64748b"
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-[10px]"
                >
                  {formatNumber(tick, 1)}
                </text>
              </g>
            );
          })}

          <text x={paddingX} y={height - 10} fill="#64748b" textAnchor="start" className="text-[10px]">
            {formatDate(data[0].timestamp)}
          </text>
          <text x={width / 2} y={height - 10} fill="#64748b" textAnchor="middle" className="text-[10px]">
            {formatDate(data[Math.floor(data.length / 2)].timestamp)}
          </text>
          <text x={width - paddingX} y={height - 10} fill="#64748b" textAnchor="end" className="text-[10px]">
            {formatDate(data[data.length - 1].timestamp)}
          </text>

          <path
            d={`M ${paddingX},${height - paddingY} L ${points.split(" ").join(" L ")} L ${width - paddingX},${height - paddingY} Z`}
            fill={`url(#${defId})`}
          />

          <polyline
            fill="none"
            stroke={colorHex}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />

          {data.map((point, i) => {
            const x = getX(i);
            const isHovered = hoverIndex === i;
            return (
              <g key={`point-${i}`}>
                <rect
                  x={x - ((width - 2 * paddingX) / data.length) / 2}
                  y={0}
                  width={(width - 2 * paddingX) / data.length}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  className="cursor-crosshair"
                />

                {isHovered && (
                  <circle
                    cx={x}
                    cy={getY(point.value)}
                    r={5}
                    fill={colorHex}
                    stroke="#fff"
                    strokeWidth={2}
                    className="pointer-events-none drop-shadow-md"
                  />
                )}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingY}
                    x2={x}
                    y2={height - paddingY}
                    stroke={colorHex}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.6}
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-center text-xs text-white shadow-xl"
            style={{
              left: `${(getX(hoverIndex) / width) * 100}%`,
              top: `${(getY(data[hoverIndex].value) / height) * 100}%`,
              marginTop: "-16px",
            }}
          >
            <div className="mb-1 block border-b border-slate-600 pb-1 font-semibold">
              {formatDate(data[hoverIndex].timestamp)}
            </div>
            <div className="text-slate-200">
              Value:{" "}
              <span className="font-mono font-medium text-white">
                {formatPredictionValue(data[hoverIndex].value)}
              </span>
            </div>
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </div>
        )}
      </div>
    </div>
  );
}
