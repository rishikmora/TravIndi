"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Destination } from "@/lib/api";
import { ArrowRightIcon, SparkleIcon } from "@/components/icons";

function PlanWithAiForm() {
  const { token } = useAuth();
  const router = useRouter();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listDestinations().then((list) => {
      setDestinations(list);
      if (list.length > 0) setDestinationId(list[0].id);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !destinationId) return;
    setError(null);
    setSubmitting(true);
    try {
      const itinerary = await api.planTripWithAi(
        { destination_id: destinationId, prompt, budget: budget ? Number(budget) : undefined },
        token
      );
      router.push(`/trips/${itinerary.trip_id}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not plan this trip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SparkleIcon width={24} height={24} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Plan with AI</h1>
        <p className="text-sm text-foreground/60">
          Describe what you want, pick a destination, and a real Claude-powered
          planner grounded in that destination&apos;s attractions builds a
          day-by-day itinerary.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          Destination
          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            required
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          What are you looking for?
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            rows={3}
            placeholder="e.g. I have one day and love history and architecture, keep it relaxed."
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Budget (INR, optional)
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !destinationId}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Planning… (a few seconds)" : "Plan my trip"}
          {!submitting && <ArrowRightIcon width={16} height={16} />}
        </button>
      </form>
    </div>
  );
}

export default function PlanWithAiPage() {
  return (
    <RequireAuth>
      <PlanWithAiForm />
    </RequireAuth>
  );
}
