import type { LookbackResponse } from "@/lib/forecast-client";

export default function LookbackResultCard({ result }: { result: LookbackResponse }) {
  const datasets = result.datasets;
  const totalPoints = datasets.reduce((sum, dataset) => sum + dataset.existing_points, 0);
  const totalExpected = datasets.reduce((sum, dataset) => sum + dataset.expected_points, 0);
  const coveragePercent = totalExpected > 0 ? ((totalPoints / totalExpected) * 100).toFixed(1) : "0";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-800">Data Coverage</p>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
          {coveragePercent}%
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {totalPoints.toLocaleString()} / {totalExpected.toLocaleString()} points available
      </p>
      <div className="mt-3 space-y-2">
        {datasets.map((dataset) => (
          <div
            key={dataset.dataset}
            className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  dataset.existing_points >= dataset.expected_points
                    ? "bg-emerald-500"
                    : "bg-amber-500"
                }`}
              />
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
