import Link from "next/link";

import PublicOnlyGuard from "@/components/auth/public-only-guard";

export default function Home() {
  return (
    <PublicOnlyGuard>
      <main className="relative isolate min-h-screen overflow-hidden px-4 py-14 sm:px-8 sm:py-20">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_15%,#a7f3d0_0%,transparent_30%),radial-gradient(circle_at_90%_75%,#fed7aa_0%,transparent_32%),linear-gradient(135deg,#f8fafc_0%,#ecfeff_45%,#fffbeb_100%)]" />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 rounded-[2rem] border border-white/70 bg-white/65 p-8 shadow-[0_35px_100px_-45px_rgba(15,23,42,0.7)] backdrop-blur-xl sm:p-12">
          <p className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            Grid-Sync Platform
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-6xl">
            Forecast-ready signup flow for demand, price, and weather model runs.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
            Create your account to connect upload workflows, run model inference, and keep
            forecasting artifacts tied to your profile.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </PublicOnlyGuard>
  );
}
