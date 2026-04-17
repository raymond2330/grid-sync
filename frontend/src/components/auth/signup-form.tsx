"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { ApiRequestError, signUp, type AuthResponse } from "@/lib/auth-client";

type SignUpFormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const initialFormState: SignUpFormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function SignupForm() {
  const [form, setForm] = useState<SignUpFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [account, setAccount] = useState<AuthResponse | null>(null);

  const passwordMismatch = useMemo(
    () =>
      form.confirmPassword.length > 0 && form.confirmPassword !== form.password,
    [form.confirmPassword, form.password],
  );

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.password.length >= 8 &&
    !passwordMismatch &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    if (passwordMismatch) {
      setServerError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await signUp({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      setAccount(response);
      setForm(initialFormState);

      // Persist token for immediate authenticated API usage in future steps.
      window.localStorage.setItem("grid-sync.accessToken", response.access_token);
      window.localStorage.setItem(
        "grid-sync.user",
        JSON.stringify({
          user_id: response.user_id,
          first_name: response.first_name,
          last_name: response.last_name,
          email: response.email,
          role: response.role,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setServerError(error.message);
      } else {
        setServerError("Unexpected error while creating your account.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-teal-200/70 bg-white/90 p-8 shadow-[0_30px_100px_-40px_rgba(20,184,166,0.75)] backdrop-blur-sm sm:p-10">
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-teal-200/40 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-amber-200/40 blur-2xl" />

      <div className="relative space-y-8">
        <div className="space-y-2">
          <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Grid-Sync Access
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Create your forecast workspace
          </h2>
          <p className="max-w-lg text-sm leading-7 text-slate-600 sm:text-base">
            Register once and keep your forecasting sessions, uploads, and model runs tied
            to your account.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700" htmlFor="first-name">
                <span className="font-medium">First name</span>
                <input
                  id="first-name"
                  value={form.firstName}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, firstName: event.target.value }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                  autoComplete="given-name"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700" htmlFor="last-name">
                <span className="font-medium">Last name</span>
                <input
                  id="last-name"
                  value={form.lastName}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, lastName: event.target.value }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                  autoComplete="family-name"
                  required
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-slate-700" htmlFor="email">
              <span className="font-medium">Email</span>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, email: event.target.value }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                autoComplete="email"
                required
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700" htmlFor="password">
              <span className="font-medium">Password</span>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, password: event.target.value }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className="space-y-2 text-sm text-slate-700" htmlFor="confirm-password">
              <span className="font-medium">Confirm password</span>
              <input
                id="confirm-password"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, confirmPassword: event.target.value }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-200 transition focus:border-teal-400 focus:ring"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          </div>

          {passwordMismatch || serverError ? (
            <div className="space-y-3">
              {passwordMismatch ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Passwords must match before you can submit.
                </p>
              ) : null}

              {serverError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {serverError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Creating account..." : "Create account"}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        </form>

        {account ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Signup complete</p>
            <p className="mt-1">
              Signed in as {account.first_name} {account.last_name} ({account.email}).
            </p>
            {/* <p className="mt-1 text-xs text-emerald-700">
              Your access token was stored locally as grid-sync.accessToken.
            </p> */}
          </div>
        ) : null}

        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Already registered?{" "}
            <Link
              href="/login"
              className="font-semibold text-teal-700 underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
            .
          </p>
          <Link
            href="/"
            className="inline-flex font-semibold text-teal-700 underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
