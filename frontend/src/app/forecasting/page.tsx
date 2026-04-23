"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import ForecastWorkspace from "@/components/forecast/forecast-workspace";
import {
  clearAuthSession,
  getAccessToken,
  getAuthSessionSnapshot,
  getServerAuthSessionSnapshot,
  subscribeAuthSession,
} from "@/lib/auth-session";

export default function ForecastingPage() {
  const router = useRouter();

  const session = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getServerAuthSessionSnapshot,
  );

  useEffect(() => {
    if (!session.token && !getAccessToken()) {
      router.replace("/login");
    }
  }, [router, session.token]);

  function handleSignOut() {
    clearAuthSession();
    router.replace("/");
  }

  if (!session.token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <p className="text-sm font-medium text-slate-600">Loading forecasting workspace...</p>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-14 sm:px-8 sm:py-20">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_20%,#a7f3d0_0%,transparent_32%),radial-gradient(circle_at_88%_18%,#bae6fd_0%,transparent_30%),linear-gradient(130deg,#f8fafc_0%,#ecfeff_46%,#f0fdf4_100%)]" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-4xl border border-white/70 bg-white/70 p-7 shadow-[0_35px_100px_-45px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:p-10">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Forecasting Workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Demand and Weather Forecasting
            </h1>
            <p className="text-sm leading-7 text-slate-600 sm:text-base">
              Upload demand CSV data and run automatic follow-up weather forecasts.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            >
              Sign out
            </button>
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
            >
              Back to dashboard
            </Link>
          </div>
        </section>

        <ForecastWorkspace />
      </div>
    </main>
  );
}
