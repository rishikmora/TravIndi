import Link from "next/link";
import { api } from "@/lib/api";
import { CalendarIcon, ArrowRightIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function PublicTripsPage() {
  const trips = await api.listPublicTrips();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trip journals</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real trips other travelers chose to share — the same itineraries and budgets they actually planned.
        </p>
      </div>
      {trips.length === 0 ? (
        <p className="text-sm text-foreground/60">No public trip journals yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/trips/${t.id}`}
                className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarIcon width={18} height={18} />
                </span>
                <div className="font-medium">{t.title ?? "Untitled trip"}</div>
                {t.budget != null && (
                  <div className="text-sm text-foreground/55">
                    Budget: {t.currency} {t.budget}
                  </div>
                )}
                <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  View journal
                  <ArrowRightIcon width={14} height={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
