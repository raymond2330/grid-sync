import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signup | Grid-Sync",
  description: "Create a Grid-Sync account to run forecasting workflows.",
};

export default function SignupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
