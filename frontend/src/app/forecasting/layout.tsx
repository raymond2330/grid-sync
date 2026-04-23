import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forecasting | Grid-Sync",
  description: "Forecasting workspace for demand and weather runs",
};

export default function ForecastingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
