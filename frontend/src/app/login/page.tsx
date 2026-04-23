import SigninForm from "@/components/auth/signin-form";
import PublicOnlyGuard from "@/components/auth/public-only-guard";

export default function LoginPage() {
  return (
    <PublicOnlyGuard>
      <main className="relative isolate min-h-screen overflow-hidden px-4 py-14 sm:px-8 sm:py-20">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_14%_22%,#bae6fd_0%,transparent_30%),radial-gradient(circle_at_85%_28%,#d9f99d_0%,transparent_31%),linear-gradient(140deg,#f8fafc_0%,#ecfeff_45%,#f7fee7_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-60 bg-[linear-gradient(180deg,rgba(15,23,42,0.06),transparent)]" />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:grid lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-12">
          <section className="space-y-6 lg:sticky lg:top-12">
            <p className="inline-flex rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 backdrop-blur-sm">
              Existing Account
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Sign in to continue your Grid-Sync forecasting workspace.
            </h1>
            <p className="max-w-xl text-base leading-8 text-slate-700">
              Use your account credentials to access protected API workflows and continue
              training or inference tasks.
            </p>
          </section>

          <section>
            <SigninForm />
          </section>
        </div>
      </main>
    </PublicOnlyGuard>
  );
}
