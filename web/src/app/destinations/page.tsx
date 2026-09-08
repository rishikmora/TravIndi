import Link from "next/link";
import { api } from "@/lib/api";
import { ArrowRightIcon, MapPinIcon } from "@/components/icons";

export const dynamic = "force-dynamic"; // public data still changes at runtime; no need to cache across requests yet

export default async function DestinationsPage() {
  const destinations = await api.listDestinations();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Destinations</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real seeded destinations with live safety scores and crowd signal.
        </p>
      </div>
      {destinations.length === 0 ? (
        <p className="text-foreground/60">No destinations yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d, i) => (
            <li key={d.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
              <Link
                href={`/destinations/${d.id}`}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPinIcon width={18} height={18} />
                </span>
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-sm text-foreground/55">
                    {[d.city, d.state].filter(Boolean).join(", ")}
                  </div>
                </div>
                <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  View details
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
