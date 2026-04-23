import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Grid-Sync",
  description: "Authenticated forecasting dashboard",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
