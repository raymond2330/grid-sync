export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDate(timestamp: string): string {
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

export function formatDateTimeLocal(value: Date): string {
  const pad = (input: number): string => String(input).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

export function parseFlexibleTimestamp(value: string): Date | null {
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

export function detectForecastStartFromCsv(csvText: string): string | null {
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

export function formatPredictionValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}
