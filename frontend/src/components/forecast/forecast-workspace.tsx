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
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
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

function ForecastResultTable({ result }: { result: ForecastResponse }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/85">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">Forecast saved to database</p>
        <p className="text-xs text-slate-500">
          Run ID {result.run_id} · {result.dataset} · target {result.target_feature}
        </p>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {result.predictions.map((point) => (
              <tr key={point.timestamp}>
                <td className="px-4 py-3 text-slate-700">{point.timestamp}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {formatPredictionValue(point.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LookbackResultCard({ result }: { result: LookbackResponse }) {
  const datasets = result.datasets;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
      <p className="font-semibold">Lookback synchronized</p>
      <p className="mt-1 text-xs text-emerald-800">
        Forecast start {result.forecast_start} · Lookback {result.lookback_days} days
      </p>
      <div className="mt-4 space-y-3">
        {datasets.map((dataset) => (
          <div key={dataset.dataset} className="rounded-xl bg-white/80 p-3 text-emerald-950">
            <p className="font-semibold capitalize">{dataset.dataset}</p>
            <p className="text-xs text-emerald-800">
              target {dataset.target_feature} · existing {dataset.existing_points}/{dataset.expected_points}
            </p>
            <p className="text-xs text-emerald-800">
              missing {dataset.missing_points} · {dataset.fetched ? `upserted ${dataset.upserted_rows} rows` : "already current"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ForecastWorkspace() {
  const [demandForm, setDemandForm] = useState<DemandFormState>(initialDemandState);
  const [autoWeatherDatasets, setAutoWeatherDatasets] = useState<WeatherForecastDataset[]>(
    weatherDatasetOrder,
  );

  const [demandLookback, setDemandLookback] = useState<LookbackResponse | null>(null);
  const [demandForecast, setDemandForecast] = useState<ForecastResponse | null>(null);
  const [autoWeatherRuns, setAutoWeatherRuns] = useState<AutoWeatherRun[]>([]);

  const [isSyncingDemand, setIsSyncingDemand] = useState(false);
  const [isForecastingDemand, setIsForecastingDemand] = useState(false);
  const [isAutoForecastingWeather, setIsAutoForecastingWeather] = useState(false);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [autoWeatherErrors, setAutoWeatherErrors] = useState<string[]>([]);

  const selectedAutoWeatherLabels = useMemo(
    () => autoWeatherDatasets.map((dataset) => weatherDatasetLabels[dataset]),
    [autoWeatherDatasets],
  );

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

  async function handleSyncDemandLookback() {
    setDemandError(null);
    setIsSyncingDemand(true);

    try {
      const result = await ensureLookback({
        forecastStart: demandForm.forecastStart,
        latitude: Number(demandForm.latitude),
        longitude: Number(demandForm.longitude),
        datasets: ["demand"],
      });
      setDemandLookback(result);
    } catch (error: unknown) {
      const message = error instanceof ForecastApiError ? error.message : "Unable to sync demand lookback.";
      setDemandError(message);
    } finally {
      setIsSyncingDemand(false);
    }
  }

  async function handleForecastDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDemandError(null);

    if (!demandForm.csvFile) {
      setDemandError("Please choose a demand CSV file first.");
      return;
    }

    setIsForecastingDemand(true);

    try {
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

  return (
    <section className="space-y-6">
      <div className="rounded-4xl border border-white/70 bg-white/70 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:p-8">
        <div className="space-y-3">
          <p className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            Forecast Workspace
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Upload demand data or sync NASA lookback, then forecast
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            Demand forecasts use your uploaded CSV as the canonical target series and overwrite prior
            demand rows for the selected location. Air temperature, solar irradiance, and wind speed
            forecasts use NASA POWER lookback data, which can be refreshed and upserted when the
            current 7-day window is missing or when you want new data.
          </p>
        </div>
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
                type="button"
                onClick={handleSyncDemandLookback}
                disabled={isSyncingDemand || !demandForm.forecastStart}
                className="inline-flex items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800 transition hover:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncingDemand ? "Syncing lookback..." : "Prepare 7-day lookback"}
              </button>
              <button
                type="submit"
                disabled={isForecastingDemand || isAutoForecastingWeather || !demandForm.csvFile}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isForecastingDemand || isAutoForecastingWeather
                  ? "Forecasting demand and weather..."
                  : "Forecast demand and weather"}
              </button>
            </div>
          </form>

          {demandLookback ? <div className="mt-5"><LookbackResultCard result={demandLookback} /></div> : null}
          {demandForecast ? <div className="mt-5"><ForecastResultTable result={demandForecast} /></div> : null}
          {autoWeatherRuns.length > 0 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm font-semibold text-slate-800">Automatic weather forecasts</p>
              {autoWeatherRuns.map((run) => (
                <div key={run.dataset} className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {weatherDatasetLabels[run.dataset]}
                    </p>
                    <p className="text-xs text-slate-500">
                      target {run.forecast.target_feature} · run ID {run.forecast.run_id}
                    </p>
                  </div>
                  <LookbackResultCard result={run.lookback} />
                  <ForecastResultTable result={run.forecast} />
                </div>
              ))}
            </div>
          ) : null}
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
