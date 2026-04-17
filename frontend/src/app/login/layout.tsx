import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | Grid-Sync",
  description: "Sign in to Grid-Sync forecasting workspace.",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
