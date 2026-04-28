"use client";

import type { ChangeEvent, FormEvent } from "react";

import {
  weatherDatasetLabels,
  weatherDatasetOrder,
} from "@/components/forecast/forecast-constants";
import type { DemandFormState } from "@/components/forecast/forecast-types";
import type { WeatherForecastDataset } from "@/lib/forecast-client";

type DemandForecastFormProps = {
  demandForm: DemandFormState;
  demandCsvName: string;
  autoWeatherDatasets: WeatherForecastDataset[];
  selectedAutoWeatherLabels: string[];
  isForecastingDemand: boolean;
  isAutoForecastingWeather: boolean;
  canClear: boolean;
  onForecastStartChange: (value: string) => void;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
  onDemandFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleAutoWeatherDataset: (dataset: WeatherForecastDataset) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClearResults: () => void;
};

export default function DemandForecastForm({
  demandForm,
  demandCsvName,
  autoWeatherDatasets,
  selectedAutoWeatherLabels,
  isForecastingDemand,
  isAutoForecastingWeather,
  canClear,
  onForecastStartChange,
  onLatitudeChange,
  onLongitudeChange,
  onDemandFileChange,
  onToggleAutoWeatherDataset,
  onSubmit,
  onClearResults,
}: DemandForecastFormProps) {
  const isBusy = isForecastingDemand || isAutoForecastingWeather;
  const hasAutoWeatherSelection = selectedAutoWeatherLabels.length > 0;

  return (
    <article className="rounded-4xl border border-teal-200/70 bg-white/90 p-6 shadow-[0_24px_80px_-45px_rgba(20,184,166,0.7)] backdrop-blur-sm sm:p-8">
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
          Upload CSV and forecast demand
        </h3>
        <p className="text-sm leading-7 text-slate-600">
          Sample format: DATETIME,TOTAL. Uploading a new file overwrites the previous canonical
          demand series at the same location.
        </p>
      </div>

      <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          View CSV example
        </summary>
        <pre className="mt-3 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
{`DATETIME,TOTAL
2023-01-01 00:00:00,4.872574166584001
2023-01-01 00:05:00,4.836180329978189`}
        </pre>
      </details>

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
                  onToggleAutoWeatherDataset(dataset);
                }}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="font-medium">{weatherDatasetLabels[dataset]}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {hasAutoWeatherSelection
            ? `Selected: ${selectedAutoWeatherLabels.join(", ")}`
            : "No automatic follow-up forecasts selected."}
        </p>
      </div>

      <form className="mt-6 space-y-5" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-700" htmlFor="demand-forecast-start">
            <span className="font-medium">Forecast start</span>
            <input
              id="demand-forecast-start"
              type="datetime-local"
              value={demandForm.forecastStart}
              onChange={(event) => {
                onForecastStartChange(event.target.value);
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
                onLatitudeChange(event.target.value);
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
                onLongitudeChange(event.target.value);
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
              onChange={onDemandFileChange}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700"
              required
            />
            <p className="text-xs text-slate-500">Selected: {demandCsvName}</p>
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={isBusy || !demandForm.csvFile}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isBusy ? "Running forecast..." : "Run Forecast"}
          </button>
          <button
            type="button"
            onClick={onClearResults}
            disabled={!canClear}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Results
          </button>
        </div>
      </form>
    </article>
  );
}
