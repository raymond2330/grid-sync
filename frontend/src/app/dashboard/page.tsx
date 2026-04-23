"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import {
  clearAuthSession,
  getAccessToken,
  getAuthSessionSnapshot,
  getServerAuthSessionSnapshot,
  subscribeAuthSession,
} from "@/lib/auth-session";

export default function DashboardPage() {
  const router = useRouter();

  const session = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getServerAuthSessionSnapshot,
  );

  useEffect(() => {
    // During hydration, useSyncExternalStore may briefly expose the server snapshot.
    // Avoid redirecting if a persisted token already exists in localStorage.
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
        <p className="text-sm font-medium text-slate-600">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-14 sm:px-8 sm:py-20">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_20%,#a7f3d0_0%,transparent_32%),radial-gradient(circle_at_88%_18%,#bae6fd_0%,transparent_30%),linear-gradient(130deg,#f8fafc_0%,#ecfeff_46%,#f0fdf4_100%)]" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-4xl border border-white/70 bg-white/70 p-7 shadow-[0_35px_100px_-45px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:p-10">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Authenticated Area
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Dashboard
            </h1>
            <p className="text-sm leading-7 text-slate-600 sm:text-base">
              {session.user
                ? `Welcome, ${session.user.first_name} ${session.user.last_name}.`
                : "Welcome back. Your session is active."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
          >
            Sign out
          </button>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Account
            </h2>
            <p className="mt-3 text-sm text-slate-700">
              {session.user ? session.user.email : "User profile loaded from active session."}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Forecasting
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-slate-700">
                Open the dedicated forecasting workspace from here.
              </p>
              <Link
                href="/forecasting"
                className="text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
              >
                Go to forecasting workspace
              </Link>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/85 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Navigation
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/"
                className="text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
              >
                Back to home
              </Link>
              <Link
                href="/login"
                className="text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
              >
                Sign in page
              </Link>
              <Link
                href="/forecasting"
                className="text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
              >
                Forecasting workspace
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
