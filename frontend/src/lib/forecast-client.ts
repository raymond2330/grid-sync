const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8001";

export type ForecastDataset = "demand" | "price" | "temperature" | "solar" | "wind";

export type WeatherForecastDataset = Exclude<ForecastDataset, "demand">;

export type ForecastPoint = {
  timestamp: string;
  value: number;
};

export type ForecastResponse = {
  run_id: number;
  dataset: ForecastDataset;
  model_family: string;
  target_feature: string;
  forecast_start: string;
  lookback_start: string;
  lookback_end: string;
  horizon: number;
  predictions: ForecastPoint[];
};

export type LookbackDatasetResult = {
  dataset: ForecastDataset;
  target_feature: string;
  lookback_start: string;
  lookback_end: string;
  expected_points: number;
  existing_points: number;
  missing_points: number;
  fetched: boolean;
  upserted_rows: number;
};

export type LookbackResponse = {
  forecast_start: string;
  lookback_days: number;
  latitude: number;
  longitude: number;
  datasets: LookbackDatasetResult[];
};

export class ForecastApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ForecastApiError";
    this.status = status;
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const bodyText = await response.text();
  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return null;
  }
}

function extractDetail(parsedBody: unknown, fallback: string): string {
  if (typeof parsedBody === "object" && parsedBody !== null && "detail" in parsedBody) {
    const detail = (parsedBody as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          if (
            typeof item === "object" &&
            item !== null &&
            "msg" in item &&
            typeof (item as { msg?: unknown }).msg === "string"
          ) {
            return (item as { msg: string }).msg;
          }

          return "";
        })
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  }

  return fallback;
}

function toIsoPayload(value: string): string {
  const trimmed = value.trim();
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const isoInput = hasTimezone
    ? trimmed
    : `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}Z`;
  const parsed = new Date(isoInput);
  if (Number.isNaN(parsed.getTime())) {
    throw new ForecastApiError("Please choose a valid forecast start datetime.", 400);
  }

  return parsed.toISOString();
}

async function ensureOk(response: Response, fallback: string): Promise<unknown> {
  const parsedBody = await parseJsonResponse(response);
  if (!response.ok) {
    throw new ForecastApiError(extractDetail(parsedBody, fallback), response.status);
  }

  return parsedBody;
}

export async function ensureLookback(payload: {
  forecastStart: string;
  latitude: number;
  longitude: number;
  datasets: ForecastDataset[];
  lookbackDays?: number;
}): Promise<LookbackResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/nasa/ensure-lookback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      forecast_start: toIsoPayload(payload.forecastStart),
      latitude: payload.latitude,
      longitude: payload.longitude,
      datasets: payload.datasets,
      lookback_days: payload.lookbackDays ?? 7,
    }),
    cache: "no-store",
  });

  const parsedBody = await ensureOk(response, "Unable to refresh lookback data.");
  return parsedBody as LookbackResponse;
}

export async function forecastDemand(payload: {
  forecastStart: string;
  latitude: number;
  longitude: number;
  demandCsv: File;
  modelFamily?: "transformer";
}): Promise<ForecastResponse> {
  const formData = new FormData();
  formData.append("forecast_start", toIsoPayload(payload.forecastStart));
  formData.append("latitude", String(payload.latitude));
  formData.append("longitude", String(payload.longitude));
  formData.append("model_family", payload.modelFamily ?? "transformer");
  formData.append("demand_csv", payload.demandCsv);

  const response = await fetch(`${API_BASE_URL}/api/v1/forecast/demand`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  const parsedBody = await ensureOk(response, "Demand forecast failed.");
  return parsedBody as ForecastResponse;
}

export async function forecastWeather(payload: {
  dataset: WeatherForecastDataset;
  forecastStart: string;
  latitude: number;
  longitude: number;
  modelFamily?: "transformer";
}): Promise<ForecastResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/forecast/weather`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dataset: payload.dataset,
      forecast_start: toIsoPayload(payload.forecastStart),
      latitude: payload.latitude,
      longitude: payload.longitude,
      model_family: payload.modelFamily ?? "transformer",
    }),
    cache: "no-store",
  });

  const parsedBody = await ensureOk(response, "Weather forecast failed.");
  return parsedBody as ForecastResponse;
}
