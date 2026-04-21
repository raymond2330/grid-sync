"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode, useSyncExternalStore } from "react";

import {
  getAccessToken,
  getAuthSessionSnapshot,
  getServerAuthSessionSnapshot,
  subscribeAuthSession,
} from "@/lib/auth-session";

type PublicOnlyGuardProps = {
  children: ReactNode;
};

export default function PublicOnlyGuard({ children }: PublicOnlyGuardProps) {
  const router = useRouter();

  const session = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getServerAuthSessionSnapshot,
  );

  const hasSessionToken = Boolean(session.token);

  useEffect(() => {
    if (hasSessionToken || getAccessToken()) {
      router.replace("/dashboard");
    }
  }, [hasSessionToken, router]);

  if (hasSessionToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <p className="text-sm font-medium text-slate-600">Redirecting to dashboard...</p>
      </main>
    );
  }

  return <>{children}</>;
}
