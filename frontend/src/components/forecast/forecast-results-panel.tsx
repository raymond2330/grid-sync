"use client";

import {
  forecastTabLabels,
  type ForecastTab,
} from "@/components/forecast/forecast-constants";
import type { ForecastEntry } from "@/components/forecast/forecast-types";
import ForecastResultTable from "@/components/forecast/forecast-result-table";
import LookbackResultCard from "@/components/forecast/lookback-result-card";

type ForecastResultsPanelProps = {
  filteredForecasts: ForecastEntry[];
  selectedTab: ForecastTab;
  onSelectTab: (tab: ForecastTab) => void;
  forecastCounts: Record<ForecastTab, number>;
  hasForecasts: boolean;
};

export default function ForecastResultsPanel({
  filteredForecasts,
  selectedTab,
  onSelectTab,
  forecastCounts,
  hasForecasts,
}: ForecastResultsPanelProps) {
  if (!hasForecasts) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-800">No forecasts yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Upload a demand CSV and run a forecast to see results and weather follow-ups.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        {Object.entries(forecastTabLabels).map(([key, label]) => {
          const tabKey = key as ForecastTab;
          const hasData = forecastCounts[tabKey] > 0;
          const isActive = selectedTab === tabKey;
          const forecastCount = forecastCounts[tabKey];

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectTab(tabKey)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div
                className={`h-1.5 w-1.5 rounded-full ${
                  hasData ? (isActive ? "bg-white" : "bg-slate-400") : "bg-slate-200"
                }`}
              />
              <span>{label}</span>
              {hasData && (
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {forecastCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">
            {filteredForecasts.length > 0
              ? `${filteredForecasts.length} forecast${filteredForecasts.length > 1 ? "s" : ""} for ${forecastTabLabels[selectedTab]}`
              : "No forecasts available for this dataset"}
          </p>
          {filteredForecasts.length > 0 && (
            <span className="text-xs text-slate-500">
              Switch tabs to view different forecast types
            </span>
          )}
        </div>

        {filteredForecasts.length > 0 ? (
          filteredForecasts.map((forecastEntry, index) => (
            <div
              key={`${forecastEntry.dataset}-${forecastEntry.forecast.run_id}-${index}`}
              className="space-y-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/30 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-base font-semibold text-slate-900">
                    {forecastTabLabels[forecastEntry.dataset]}
                  </p>
                  <p className="text-xs text-slate-500">
                    target {forecastEntry.forecast.target_feature} · run ID {forecastEntry.forecast.run_id}
                  </p>
                </div>
                {forecastEntry.lookback && <LookbackResultCard result={forecastEntry.lookback} />}
              </div>
              <ForecastResultTable result={forecastEntry.forecast} />
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
            <p className="text-sm text-slate-500">
              {forecastTabLabels[selectedTab]} forecasts will appear here after running the forecast
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
