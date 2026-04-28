import type {
  ForecastDataset,
  ForecastResponse,
  LookbackResponse,
  WeatherForecastDataset,
} from "@/lib/forecast-client";

export type DemandFormState = {
  forecastStart: string;
  latitude: string;
  longitude: string;
  csvFile: File | null;
};

export type AutoWeatherRun = {
  dataset: WeatherForecastDataset;
  lookback: LookbackResponse;
  forecast: ForecastResponse;
};

export type ForecastEntry = {
  dataset: ForecastDataset;
  forecast: ForecastResponse;
  lookback?: LookbackResponse;
};
