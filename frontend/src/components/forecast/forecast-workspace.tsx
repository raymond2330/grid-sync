"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import {
  ensureLookback,
  forecastDemand,
  forecastWeather,
  type ForecastResponse,
  type LookbackResponse,
  type WeatherForecastDataset,
  ForecastApiError,
} from "@/lib/forecast-client";

// Business-grade UI utility functions
function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function calculatePercentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    error: "bg-rose-100 text-rose-800",
    info: "bg-blue-100 text-blue-800",
    neutral: "bg-slate-100 text-slate-800",
  };
  return colors[status] || colors.neutral;
}

type DemandFormState = {
  forecastStart: string;
  latitude: string;
  longitude: string;
  csvFile: File | null;
};

type AutoWeatherRun = {
  dataset: WeatherForecastDataset;
  lookback: LookbackResponse;
  forecast: ForecastResponse;
};

const weatherDatasetOrder: WeatherForecastDataset[] = [
  "price",
  "temperature",
  "solar",
  "wind",
];

const weatherDatasetLabels: Record<WeatherForecastDataset, string> = {
  price: "Electricity price",
  temperature: "Air temperature",
  solar: "Solar irradiance",
  wind: "Wind speed",
};

const initialDemandState: DemandFormState = {
  forecastStart: "",
  latitude: "14.5995",
  longitude: "120.9842",
  csvFile: null,
};

function formatDateTimeLocal(value: Date): string {
  const pad = (input: number): string => String(input).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function parseFlexibleTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function detectForecastStartFromCsv(csvText: string): string | null {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const candidateLine = lines[index];
    const [timestampValue] = candidateLine.split(",");
    const parsed = parseFlexibleTimestamp(timestampValue);
    if (parsed) {
      return formatDateTimeLocal(new Date(parsed.getTime() + 5 * 60 * 1000));
    }
  }

  return null;
}

function formatPredictionValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

function SimpleLineChart({ data, color = "emerald" }: { data: { timestamp: string; value: number }[]; color?: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const width = 800;
  const height = 240;
  const paddingX = 50;
  const paddingY = 40;

  const getX = (i: number) => (i / (data.length - 1)) * (width - 2 * paddingX) + paddingX;
  const getY = (val: number) => height - paddingY - ((val - minVal) / range) * (height - 2 * paddingY);

  const points = data.map((point, i) => `${getX(i)},${getY(point.value)}`).join(" ");

  const colorHex = color === "emerald" ? "#10b981" : color === "blue" ? "#3b82f6" : color === "amber" ? "#f59e0b" : "#64748b";
  const defId = `gradient-${color}`;

  const defaultYAxisTicks = 5;
  const yTicks = Array.from({ length: defaultYAxisTicks }).map((_, i) => minVal + (range / (defaultYAxisTicks - 1)) * i);

  return (
    <div className="w-full bg-slate-50/50 rounded-xl border border-slate-100 p-4 flex flex-col items-center">
      <div 
        className="relative w-full" 
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto text-xs font-sans overflow-visible">
          <defs>
            <linearGradient id={defId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorHex} stopOpacity={0.4} />
              <stop offset="100%" stopColor={colorHex} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Y Axis Grid & Labels */}
          {yTicks.map((tick, i) => {
            const y = getY(tick);
            return (
              <g key={`y-${i}`}>
                <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray={i === 0 ? "none" : "4 4"} />
                <text x={paddingX - 10} y={y} fill="#64748b" textAnchor="end" dominantBaseline="middle" className="text-[10px]">
                  {formatNumber(tick, 1)}
                </text>
              </g>
            );
          })}

          {/* X Axis Labels */}
          <text x={paddingX} y={height - 10} fill="#64748b" textAnchor="start" className="text-[10px]">
            {formatDate(data[0].timestamp)} UTC
          </text>
          <text x={width / 2} y={height - 10} fill="#64748b" textAnchor="middle" className="text-[10px]">
            {formatDate(data[Math.floor(data.length / 2)].timestamp)} UTC
          </text>
          <text x={width - paddingX} y={height - 10} fill="#64748b" textAnchor="end" className="text-[10px]">
            {formatDate(data[data.length - 1].timestamp)} UTC
          </text>

          {/* Area */}
          <path
            d={`M ${paddingX},${height - paddingY} L ${points.split(" ").join(" L ")} L ${width - paddingX},${height - paddingY} Z`}
            fill={`url(#${defId})`}
          />

          {/* Line */}
          <polyline
            fill="none"
            stroke={colorHex}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />

          {/* Hover Interactivity */}
          {data.map((point, i) => {
            const x = getX(i);
            const isHovered = hoverIndex === i;
            return (
              <g key={`point-${i}`}>
                {/* Invisible hover area */}
                <rect
                  x={x - ((width - 2 * paddingX) / data.length) / 2}
                  y={0}
                  width={(width - 2 * paddingX) / data.length}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  className="cursor-crosshair"
                />
                
                {/* Active point indicator */}
                {isHovered && (
                  <circle cx={x} cy={getY(point.value)} r={5} fill={colorHex} stroke="#fff" strokeWidth={2} className="pointer-events-none drop-shadow-md" />
                )}
                {isHovered && (
                  <line x1={x} y1={paddingY} x2={x} y2={height - paddingY} stroke={colorHex} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} className="pointer-events-none" />
                )}
              </g>
            );
          })}
        </svg>

        {hoverIndex !== null && (
          <div 
            className="absolute z-10 pointer-events-none bg-slate-800 text-white rounded-lg shadow-xl text-xs p-3 transform -translate-x-1/2 -translate-y-full border border-slate-700 w-48 text-center"
            style={{ 
              left: `${(getX(hoverIndex) / width) * 100}%`, 
              top: `${(getY(data[hoverIndex].value) / height) * 100}%`,
              marginTop: '-16px'
            }}
          >
            <div className="font-semibold mb-1 pb-1 border-b border-slate-600 block">{formatDate(data[hoverIndex].timestamp)} UTC</div>
            <div className="text-slate-200">
               Value: <span className="text-white font-mono font-medium">{formatPredictionValue(data[hoverIndex].value)}</span>
            </div>
            {/* Tooltip caret */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
          </div>
        )}
      </div>
    </div>
  );
}

function ForecastResultTable({ result, showDownload = false }: { result: ForecastResponse; showDownload?: boolean }) {
  const chartColor = result.dataset === "demand" ? "emerald" : result.dataset === "solar" ? "amber" : result.dataset === "wind" ? "blue" : "slate";

  const handleDownloadCSV = () => {
    const csvContent = "timestamp,value\n" + result.predictions.map(p => `${p.timestamp},${p.value}`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${result.dataset}_forecast_${result.run_id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/85 shadow-lg">
      <div className="border-b border-slate-200 px-4 py-3 bg-slate-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Forecast Results</p>
            <p className="text-xs text-slate-500">
              Run ID {result.run_id} · {result.dataset} · target {result.target_feature}
            </p>
          </div>
          {showDownload && (
            <button
              onClick={handleDownloadCSV}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </button>
          )}
        </div>
      </div>

      {/* Graph */}
      <div className="px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Forecast Trend</p>
        <SimpleLineChart data={result.predictions} color={chartColor} />
      </div>

      {/* Table */}
      <div className="max-h-64 overflow-auto border-t border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Timestamp</th>
              <th className="px-4 py-3 font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {result.predictions.slice(0, 20).map((point) => (
              <tr key={point.timestamp} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-700">{formatDate(point.timestamp)} UTC</td>
                <td className="px-4 py-2.5 font-semibold text-slate-900">
                  {formatPredictionValue(point.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.predictions.length > 20 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs text-slate-500">Showing first 20 of {result.predictions.length} results</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LookbackResultCard({ result }: { result: LookbackResponse }) {
  const datasets = result.datasets;
  const totalPoints = datasets.reduce((sum, d) => sum + d.existing_points, 0);
  const totalExpected = datasets.reduce((sum, d) => sum + d.expected_points, 0);
  const coveragePercent = totalExpected > 0 ? ((totalPoints / totalExpected) * 100).toFixed(1) : "0";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-800">Data Coverage</p>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{coveragePercent}%</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {totalPoints.toLocaleString()} / {totalExpected.toLocaleString()} points available
      </p>
      <div className="mt-3 space-y-2">
        {datasets.map((dataset) => (
          <div key={dataset.dataset} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${
                dataset.existing_points >= dataset.expected_points ? "bg-emerald-500" : "bg-amber-500"
              }`} />
              <p className="text-sm font-medium capitalize text-slate-700">{dataset.dataset}</p>
            </div>
            <p className="text-xs text-slate-500">
              {dataset.existing_points.toLocaleString()} / {dataset.expected_points.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Last updated: {new Date(result.forecast_start).toLocaleDateString()}
      </p>
    </div>
  );
}

export default function ForecastWorkspace() {
  const [demandForm, setDemandForm] = useState<DemandFormState>(initialDemandState);
  const [autoWeatherDatasets, setAutoWeatherDatasets] = useState<WeatherForecastDataset[]>(
    weatherDatasetOrder.filter((dataset) => dataset !== "price"),
  );

  const [demandLookback, setDemandLookback] = useState<LookbackResponse | null>(null);
  const [demandForecast, setDemandForecast] = useState<ForecastResponse | null>(null);
  const [autoWeatherRuns, setAutoWeatherRuns] = useState<AutoWeatherRun[]>([]);

  const [isForecastingDemand, setIsForecastingDemand] = useState(false);
  const [isAutoForecastingWeather, setIsAutoForecastingWeather] = useState(false);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [autoWeatherErrors, setAutoWeatherErrors] = useState<string[]>([]);

  // Business metrics for dashboard
  const totalForecastPoints = useMemo(() => {
    let total = 0;
    if (demandForecast) total += demandForecast.predictions.length;
    total += autoWeatherRuns.reduce((sum, run) => sum + run.forecast.predictions.length, 0);
    return total;
  }, [demandForecast, autoWeatherRuns]);

  const totalRunCost = useMemo(() => {
    const costPerForecast = 0.001; // Placeholder business cost
    const totalRuns = 1 + autoWeatherRuns.length;
    return totalRuns * costPerForecast;
  }, [autoWeatherRuns]);

  const selectedAutoWeatherLabels = useMemo(
    () => autoWeatherDatasets.map((dataset) => weatherDatasetLabels[dataset]),
    [autoWeatherDatasets],
  );

  const availableForecastDatasets: Record<string, string> = {
    demand: "Demand",
    price: "Price",
    wind: "Wind",
    solar: "Solar Irradiance",
    temperature: "Air Temp",
  };

  type ForecastTab = keyof typeof availableForecastDatasets;

  const initialTab: ForecastTab = "demand";

  const [selectedTab, setSelectedTab] = useState<ForecastTab>(initialTab);

  const filteredForecasts = useMemo(() => {
    const allForecasts: { dataset: string; forecast: ForecastResponse; lookback?: LookbackResponse }[] = [];
    
    if (demandForecast) {
      allForecasts.push({ dataset: "demand", forecast: demandForecast, lookback: demandLookback });
    }
    autoWeatherRuns.forEach((run) => {
      allForecasts.push({ dataset: run.dataset, forecast: run.forecast, lookback: run.lookback });
    });

    return allForecasts.filter((f) => f.dataset === selectedTab);
  }, [demandForecast, autoWeatherRuns, demandLookback, selectedTab]);

  async function handleDemandFileChange(event: ChangeEvent<HTMLInputElement>) {
    setDemandError(null);
    setAutoWeatherErrors([]);
    const file = event.target.files?.[0] ?? null;

    setDemandForm((previous) => ({ ...previous, csvFile: file }));

    if (!file) {
      return;
    }

    try {
      const csvText = await file.text();
      const forecastStart = detectForecastStartFromCsv(csvText);

      if (forecastStart) {
        setDemandForm((previous) => ({ ...previous, forecastStart }));
      }
    } catch {
      setDemandError("Unable to read the uploaded CSV to auto-detect the forecast start.");
    }
  }

  function toggleAutoWeatherDataset(dataset: WeatherForecastDataset) {
    setAutoWeatherDatasets((previous) =>
      previous.includes(dataset)
        ? previous.filter((item) => item !== dataset)
        : [...previous, dataset],
    );
  }

  // Removed redundant sync button - lookback sync is now automatic

  async function handleForecastDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDemandError(null);

    if (!demandForm.csvFile) {
      setDemandError("Please choose a demand CSV file first.");
      return;
    }

    setIsForecastingDemand(true);

    try {
      // Auto-sync lookback (no manual button needed)
      const demandLookbackResult = await ensureLookback({
        forecastStart: demandForm.forecastStart,
        latitude: Number(demandForm.latitude),
        longitude: Number(demandForm.longitude),
        datasets: ["demand"],
      });
      setDemandLookback(demandLookbackResult);

      const result = await forecastDemand({
        forecastStart: demandForm.forecastStart,
        latitude: Number(demandForm.latitude),
        longitude: Number(demandForm.longitude),
        demandCsv: demandForm.csvFile,
      });
      setDemandForecast(result);

      if (autoWeatherDatasets.length > 0) {
        setIsAutoForecastingWeather(true);
        setAutoWeatherErrors([]);

        const autoRuns: AutoWeatherRun[] = [];
        const runErrors: string[] = [];

        for (const dataset of autoWeatherDatasets) {
          try {
            // Auto-sync lookback for weather datasets
            const lookback = await ensureLookback({
              forecastStart: result.forecast_start,
              latitude: Number(demandForm.latitude),
              longitude: Number(demandForm.longitude),
              datasets: [dataset],
            });

            const forecast = await forecastWeather({
              dataset,
              forecastStart: result.forecast_start,
              latitude: Number(demandForm.latitude),
              longitude: Number(demandForm.longitude),
            });

            autoRuns.push({ dataset, lookback, forecast });
          } catch (error: unknown) {
            const message =
              error instanceof ForecastApiError
                ? error.message
                : `Automatic forecast failed for ${weatherDatasetLabels[dataset]}.`;
            runErrors.push(message);
          }
        }

        setAutoWeatherRuns(autoRuns);
        setAutoWeatherErrors(runErrors);
      } else {
        setAutoWeatherRuns([]);
        setAutoWeatherErrors([]);
      }
    } catch (error: unknown) {
      const message = error instanceof ForecastApiError ? error.message : "Demand forecast failed.";
      setDemandError(message);
    } finally {
      setIsForecastingDemand(false);
      setIsAutoForecastingWeather(false);
    }
  }

  const demandCsvName = demandForm.csvFile?.name ?? "No file selected";
  const selectedDatasetsCount = autoWeatherDatasets.length;

  return (
    <section className="space-y-6">
      {/* Business Dashboard Header */}
      <div className="rounded-4xl border border-white/70 bg-white/70 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Forecast Workspace</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Business Forecasting</h2>
          </div>
          {/* Business Metrics */}
          <div className="flex gap-4">
            {demandForecast && (
              <div className="rounded-xl bg-emerald-50/90 px-4 py-3">
                <p className="text-xs text-emerald-600">Demand Forecast</p>
                <p className="text-lg font-bold text-emerald-900">{demandForecast.predictions.length} points</p>
              </div>
            )}
            {autoWeatherRuns.length > 0 && (
              <div className="rounded-xl bg-blue-50/90 px-4 py-3">
                <p className="text-xs text-blue-600">Weather Forecasts</p>
                <p className="text-lg font-bold text-blue-900">{autoWeatherRuns.length} datasets</p>
              </div>
            )}
            <div className="rounded-xl bg-slate-50/90 px-4 py-3">
              <p className="text-xs text-slate-600">Total Points</p>
              <p className="text-lg font-bold text-slate-900">{totalForecastPoints}</p>
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600">
          Upload demand CSV data and automatically generate weather forecasts. Business metrics update in real-time as forecasts complete.
        </p>
      </div>

      <div className="mx-auto w-full">
        <article className="rounded-4xl border border-teal-200/70 bg-white/90 p-6 shadow-[0_24px_80px_-45px_rgba(20,184,166,0.7)] backdrop-blur-sm sm:p-8">
          <div className="space-y-2">
            {/* <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Demand
            </p> */}
            <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
              Upload CSV and forecast demand
            </h3>
            <p className="text-sm leading-7 text-slate-600">
              Sample format: DATETIME,TOTAL. Uploading a new file overwrites the previous canonical
              demand series at the same location.
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">CSV example</p>
            <pre className="mt-2 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
{`DATETIME,TOTAL
2023-01-01 00:00:00,4.872574166584001
2023-01-01 00:05:00,4.836180329978189`}
            </pre>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-semibold text-slate-800">After demand forecast, also run</p>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              The same forecast start from the uploaded CSV will be used automatically. You can
              still change it before running.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {weatherDatasetOrder.map((dataset) => (
                <label
                  key={dataset}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                    autoWeatherDatasets.includes(dataset)
                      ? "border-teal-300 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={autoWeatherDatasets.includes(dataset)}
                    onChange={() => {
                      toggleAutoWeatherDataset(dataset);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="font-medium">{weatherDatasetLabels[dataset]}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Selected: {selectedAutoWeatherLabels.length > 0 ? selectedAutoWeatherLabels.join(", ") : "None"}
            </p>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleForecastDemand}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700" htmlFor="demand-forecast-start">
                <span className="font-medium">Forecast start</span>
                <input
                  id="demand-forecast-start"
                  type="datetime-local"
                  value={demandForm.forecastStart}
                  onChange={(event) => {
                    setDemandForm((previous) => ({ ...previous, forecastStart: event.target.value }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700" htmlFor="demand-latitude">
                <span className="font-medium">Latitude</span>
                <input
                  id="demand-latitude"
                  type="number"
                  step="0.000001"
                  value={demandForm.latitude}
                  onChange={(event) => {
                    setDemandForm((previous) => ({ ...previous, latitude: event.target.value }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700" htmlFor="demand-longitude">
                <span className="font-medium">Longitude</span>
                <input
                  id="demand-longitude"
                  type="number"
                  step="0.000001"
                  value={demandForm.longitude}
                  onChange={(event) => {
                    setDemandForm((previous) => ({ ...previous, longitude: event.target.value }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700" htmlFor="demand-csv">
                <span className="font-medium">Demand CSV</span>
                <input
                  id="demand-csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleDemandFileChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700"
                  required
                />
                <p className="text-xs text-slate-500">Selected: {demandCsvName}</p>
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isForecastingDemand || isAutoForecastingWeather || !demandForm.csvFile}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isForecastingDemand || isAutoForecastingWeather ? "Running forecast..." : "Run Forecast"}
              </button>
              <button
                type="button"
                onClick={() => setDemandLookback(null)}
                disabled={!demandLookback && !demandForecast}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear Results
              </button>
            </div>
          </form>

          {/* Tabbed forecast results display */}
          <div className="mt-6 space-y-4">
            {/* Tab navigation */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
              {Object.entries(availableForecastDatasets).map(([key, label]) => {
                const hasData = filteredForecasts.some((f) => f.dataset === key);
                const isActive = selectedTab === key;
                
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedTab(key as ForecastTab)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-sm"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`h-1.5 w-1.5 rounded-full ${
                      hasData 
                        ? (isActive ? "bg-white" : "bg-slate-400") 
                        : "bg-slate-200"
                    }`} />
                    <span>{label}</span>
                    {hasData && (
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
                      }`}>
                        {autoWeatherRuns.filter(r => r.dataset === key).length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Forecasts display section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  {filteredForecasts.length > 0 
                    ? `${filteredForecasts.length} forecast${filteredForecasts.length > 1 ? 's' : ''} for ${availableForecastDatasets[selectedTab]}`
                    : "No forecasts available yet"}
                </p>
                {filteredForecasts.length > 0 && (
                  <span className="text-xs text-slate-500">
                    Switch tabs to view different forecast types
                  </span>
                )}
              </div>
              
              {filteredForecasts.length > 0 ? (
                filteredForecasts.map((f, index) => (
                  <div key={f.dataset + index} className="space-y-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/30 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <p className="text-base font-semibold text-slate-900">
                          {availableForecastDatasets[f.dataset]}
                        </p>
                        <p className="text-xs text-slate-500">
                          target {f.forecast.target_feature} · run ID {f.forecast.run_id}
                        </p>
                      </div>
                      {f.lookback && (
                        <LookbackResultCard result={f.lookback} />
                      )}
                    </div>
                    <ForecastResultTable result={f.forecast} />
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
                  <p className="text-sm text-slate-500">
                    {availableForecastDatasets[selectedTab]} forecasts will appear here after running the forecast
                  </p>
                </div>
              )}
            </div>
          </div>
          {autoWeatherErrors.length > 0 ? (
            <div className="mt-5 space-y-3">
              {autoWeatherErrors.map((errorMessage) => (
                <p key={errorMessage} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ))}
            </div>
          ) : null}
          {demandError ? (
            <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {demandError}
            </p>
          ) : null}
        </article>
      </div>
    </section>
  );
}