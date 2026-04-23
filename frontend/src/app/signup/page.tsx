import SignupForm from "@/components/auth/signup-form";
import PublicOnlyGuard from "@/components/auth/public-only-guard";

export default function SignupPage() {
  return (
    <PublicOnlyGuard>
      <main className="relative isolate min-h-screen overflow-hidden px-4 py-14 sm:px-8 sm:py-20">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_10%_20%,#99f6e4_0%,transparent_30%),radial-gradient(circle_at_80%_25%,#fde68a_0%,transparent_30%),linear-gradient(140deg,#f8fafc_0%,#ecfeff_45%,#fffbeb_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-60 bg-[linear-gradient(180deg,rgba(15,23,42,0.06),transparent)]" />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:grid lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-12">
          <section className="space-y-6 lg:sticky lg:top-12">
            <p className="inline-flex rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 backdrop-blur-sm">
              New Account
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Signup for Grid-Sync and start forecasting with live system context.
            </h1>
            <p className="max-w-xl text-base leading-8 text-slate-700">
              Create your account to upload demand data, run forecasting pipelines, and manage
              your model outputs from one workspace.
            </p>
          </section>

          <section>
            <SignupForm />
          </section>
        </div>
      </main>
    </PublicOnlyGuard>
  );
}
