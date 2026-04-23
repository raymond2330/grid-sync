"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiRequestError, signIn } from "@/lib/auth-client";
import { saveAuthSession } from "@/lib/auth-session";

type SignInFormState = {
  email: string;
  password: string;
};

const initialFormState: SignInFormState = {
  email: "",
  password: "",
};

export default function SigninForm() {
  const router = useRouter();
  const [form, setForm] = useState<SignInFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const canSubmit =
    form.email.trim().length > 0 && form.password.length >= 8 && !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    try {
      const response = await signIn({
        email: form.email.trim(),
        password: form.password,
      });

      setForm(initialFormState);
      saveAuthSession(response);
      router.replace("/dashboard");
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setServerError(error.message);
      } else {
        setServerError("Unexpected error while signing in.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-cyan-200/70 bg-white/90 p-8 shadow-[0_30px_100px_-40px_rgba(14,116,144,0.75)] backdrop-blur-sm sm:p-10">
      <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-cyan-200/45 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-8 h-48 w-48 rounded-full bg-lime-200/40 blur-2xl" />

      <div className="relative space-y-8">
        <div className="space-y-2">
          <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Account Sign in
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Welcome back to Grid-Sync
          </h2>
          <p className="max-w-lg text-sm leading-7 text-slate-600 sm:text-base">
            Sign in to continue your forecasting runs, manage uploaded datasets, and access
            saved predictions.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="space-y-2 text-sm text-slate-700" htmlFor="signin-email">
                <span className="font-medium">Email</span>
                <input
                id="signin-email"
                type="email"
                value={form.email}
                onChange={(event) => {
                    setForm((prev) => ({ ...prev, email: event.target.value }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-cyan-200 transition focus:border-cyan-400 focus:ring"
                autoComplete="email"
                required
                />
            </label>

            <label className="space-y-2 text-sm text-slate-700" htmlFor="signin-password">
                <span className="font-medium">Password</span>
                <input
                id="signin-password"
                type="password"
                value={form.password}
                onChange={(event) => {
                    setForm((prev) => ({ ...prev, password: event.target.value }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-cyan-200 transition focus:border-cyan-400 focus:ring"
                autoComplete="current-password"
                minLength={8}
                required
                />
            </label>
          </div>

          {serverError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
            {/* <span className="transition-transform group-hover:translate-x-0.5">→</span> */}
          </button>
        </form>

        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Need an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-cyan-700 underline-offset-4 hover:underline"
            >
              Create account
            </Link>
            .
          </p>
          <Link
            href="/"
            className="inline-flex font-semibold text-cyan-700 underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
