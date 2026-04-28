"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import DemandForecastForm from "@/components/forecast/demand-forecast-form";
import {
  forecastTabLabels,
  type ForecastTab,
  weatherDatasetLabels,
  weatherDatasetOrder,
} from "@/components/forecast/forecast-constants";
import ForecastResultsPanel from "@/components/forecast/forecast-results-panel";
import type {
  AutoWeatherRun,
  DemandFormState,
  ForecastEntry,
} from "@/components/forecast/forecast-types";
import { detectForecastStartFromCsv } from "@/components/forecast/forecast-utils";
import {
  ensureLookback,
  forecastDemand,
  forecastWeather,
  type ForecastResponse,
  type LookbackResponse,
  type WeatherForecastDataset,
  ForecastApiError,
} from "@/lib/forecast-client";

const initialDemandState: DemandFormState = {
  forecastStart: "",
  latitude: "13.754047755292186",
  longitude: "121.06026790342588",
  csvFile: null,
};

const initialTab: ForecastTab = "demand";

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

  const selectedAutoWeatherLabels = useMemo(
    () => autoWeatherDatasets.map((dataset) => weatherDatasetLabels[dataset]),
    [autoWeatherDatasets],
  );

  const [selectedTab, setSelectedTab] = useState<ForecastTab>(initialTab);

  const allForecasts = useMemo(() => {
    const forecasts: ForecastEntry[] = [];

    if (demandForecast) {
      forecasts.push({ dataset: "demand", forecast: demandForecast, lookback: demandLookback });
    }

    autoWeatherRuns.forEach((run) => {
      forecasts.push({ dataset: run.dataset, forecast: run.forecast, lookback: run.lookback });
    });

    return forecasts;
  }, [demandForecast, autoWeatherRuns, demandLookback]);

  const filteredForecasts = useMemo(
    () => allForecasts.filter((forecast) => forecast.dataset === selectedTab),
    [allForecasts, selectedTab],
  );

  const forecastCounts = useMemo(() => {
    const baseCounts = Object.fromEntries(
      Object.keys(forecastTabLabels).map((key) => [key, 0]),
    ) as Record<ForecastTab, number>;

    return allForecasts.reduce((acc, forecast) => {
      acc[forecast.dataset] += 1;
      return acc;
    }, baseCounts);
  }, [allForecasts]);

  const hasForecasts = allForecasts.length > 0;

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

  function handleClearResults() {
    setDemandLookback(null);
    setDemandForecast(null);
    setAutoWeatherRuns([]);
    setAutoWeatherErrors([]);
    setSelectedTab(initialTab);
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
  return (
    <section className="space-y-6">
      <div className="rounded-4xl border border-white/70 bg-white/70 p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Forecast Workspace</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Forecasting workspace
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              Upload demand CSV data and automatically generate weather forecasts from the same
              start time.
            </p>
          </div>
          {hasForecasts && (
            <div className="flex flex-wrap gap-4">
              {demandForecast && (
                <div className="rounded-xl bg-emerald-50/90 px-4 py-3">
                  <p className="text-xs text-emerald-600">Demand Forecast</p>
                  <p className="text-lg font-bold text-emerald-900">
                    {demandForecast.predictions.length} points
                  </p>
                </div>
              )}
              {autoWeatherRuns.length > 0 && (
                <div className="rounded-xl bg-blue-50/90 px-4 py-3">
                  <p className="text-xs text-blue-600">Weather Forecasts</p>
                  <p className="text-lg font-bold text-blue-900">
                    {autoWeatherRuns.length} datasets
                  </p>
                </div>
              )}
              <div className="rounded-xl bg-slate-50/90 px-4 py-3">
                <p className="text-xs text-slate-600">Total Points</p>
                <p className="text-lg font-bold text-slate-900">{totalForecastPoints}</p>
              </div>
            </div>
          )}
        </div>
        {!hasForecasts && (
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Run a demand forecast to populate results, metrics, and weather follow-ups.
          </p>
        )}
      </div>

      <div className="mx-auto w-full space-y-6">
        <DemandForecastForm
          demandForm={demandForm}
          demandCsvName={demandCsvName}
          autoWeatherDatasets={autoWeatherDatasets}
          selectedAutoWeatherLabels={selectedAutoWeatherLabels}
          isForecastingDemand={isForecastingDemand}
          isAutoForecastingWeather={isAutoForecastingWeather}
          canClear={Boolean(demandLookback || demandForecast || autoWeatherRuns.length > 0)}
          onForecastStartChange={(value) =>
            setDemandForm((previous) => ({ ...previous, forecastStart: value }))
          }
          onLatitudeChange={(value) =>
            setDemandForm((previous) => ({ ...previous, latitude: value }))
          }
          onLongitudeChange={(value) =>
            setDemandForm((previous) => ({ ...previous, longitude: value }))
          }
          onDemandFileChange={handleDemandFileChange}
          onToggleAutoWeatherDataset={toggleAutoWeatherDataset}
          onSubmit={handleForecastDemand}
          onClearResults={handleClearResults}
        />

        {autoWeatherErrors.length > 0 ? (
          <div className="space-y-3" role="alert" aria-live="polite">
            {autoWeatherErrors.map((errorMessage) => (
              <p
                key={errorMessage}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {errorMessage}
              </p>
            ))}
          </div>
        ) : null}
        {demandError ? (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
            aria-live="polite"
          >
            {demandError}
          </p>
        ) : null}

        <ForecastResultsPanel
          filteredForecasts={filteredForecasts}
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
          forecastCounts={forecastCounts}
          hasForecasts={hasForecasts}
        />
      </div>
    </section>
  );
}