"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isApiError } from "@/lib/auth-context";
import { RequireAuth } from "@/components/RequireAuth";
import { api } from "@/lib/api";

function NewTripForm() {
  const { token } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createTrip(
        { title: title || undefined, budget: budget ? Number(budget) : undefined },
        token
      );
      router.push("/trips");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not create the trip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">New trip</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Delhi weekend"
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Budget (INR, optional)
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create trip"}
        </button>
      </form>
    </div>
  );
}

export default function NewTripPage() {
  return (
    <RequireAuth>
      <NewTripForm />
    </RequireAuth>
  );
}
