"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Destination } from "@/lib/api";
import { ArrowRightIcon, MapPinIcon, SparkleIcon } from "@/components/icons";
import { DestinationExperience } from "./DestinationExperience";

export function DestinationsGrid({
  destinations,
  accessibleCounts = {},
}: {
  destinations: Destination[];
  accessibleCounts?: Record<string, number>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = destinations.find((d) => d.id === openId);

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {destinations.map((d, i) => (
          <li key={d.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-md">
              <Link href={`/destinations/${d.id}`} className="washed relative block h-36 w-full bg-surface-muted">
                {d.image_url ? (
                  <Image
                    src={d.image_url}
                    alt={d.name}
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-primary/40">
                    <MapPinIcon width={28} height={28} />
                  </span>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <Link href={`/destinations/${d.id}`}>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-sm text-foreground/55">{[d.city, d.state].filter(Boolean).join(", ")}</div>
                  {accessibleCounts[d.id] > 0 && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                      ♿ {accessibleCounts[d.id]} accessible facilit{accessibleCounts[d.id] === 1 ? "y" : "ies"}
                    </span>
                  )}
                </Link>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <Link
                    href={`/destinations/${d.id}`}
                    className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100"
                  >
                    View details
                    <ArrowRightIcon width={14} height={14} />
                  </Link>
                  <button
                    onClick={() => setOpenId(d.id)}
                    className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-[#F5EFE3] hover:opacity-90"
                  >
                    <SparkleIcon width={12} height={12} className="text-gold" />
                    Feel it
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {open && <DestinationExperience destination={open} onClose={() => setOpenId(null)} />}
    </>
  );
}
