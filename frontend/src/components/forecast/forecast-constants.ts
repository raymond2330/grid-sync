import type { ForecastDataset, WeatherForecastDataset } from "@/lib/forecast-client";

export const weatherDatasetOrder: WeatherForecastDataset[] = [
  "price",
  "temperature",
  "solar",
  "wind",
];

export const weatherDatasetLabels: Record<WeatherForecastDataset, string> = {
  price: "Electricity price",
  temperature: "Air temperature",
  solar: "Solar irradiance",
  wind: "Wind speed",
};

export const forecastTabLabels: Record<ForecastDataset, string> = {
  demand: "Demand",
  price: "Price",
  wind: "Wind",
  solar: "Solar Irradiance",
  temperature: "Air Temp",
};

export type ForecastTab = ForecastDataset;

export type ChartColor = "emerald" | "amber" | "blue" | "slate";

export const chartColorByDataset: Record<ForecastDataset, ChartColor> = {
  demand: "emerald",
  price: "slate",
  temperature: "slate",
  solar: "amber",
  wind: "blue",
};
