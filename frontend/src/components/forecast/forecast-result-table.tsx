"use client";

import type { ForecastResponse } from "@/lib/forecast-client";

import { chartColorByDataset } from "@/components/forecast/forecast-constants";
import ForecastChart from "@/components/forecast/forecast-chart";
import {
  formatDate,
  formatPredictionValue,
} from "@/components/forecast/forecast-utils";

export default function ForecastResultTable({
  result,
  showDownload = false,
}: {
  result: ForecastResponse;
  showDownload?: boolean;
}) {
  const chartColor = chartColorByDataset[result.dataset];

  const handleDownloadCSV = () => {
    const csvContent =
      "timestamp,value\n" +
      result.predictions.map((point) => `${point.timestamp},${point.value}`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${result.dataset}_forecast_${result.run_id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/85 shadow-lg">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Forecast Results</p>
            <p className="text-xs text-slate-500">
              Run ID {result.run_id} · {result.dataset} · target {result.target_feature}
            </p>
          </div>
          {showDownload && (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download CSV
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
          Forecast Trend
        </p>
        <ForecastChart data={result.predictions} color={chartColor} />
      </div>

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
                <td className="px-4 py-2.5 text-slate-700">
                  {formatDate(point.timestamp)}
                </td>
                <td className="px-4 py-2.5 font-semibold text-slate-900">
                  {formatPredictionValue(point.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.predictions.length > 20 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs text-slate-500">
              Showing first 20 of {result.predictions.length} results
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
