"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  if (loading || !token) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none" />
      </div>
    );
  }

  return <>{children}</>;
}
