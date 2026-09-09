import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { ArrowRightIcon, CompassIcon, ShieldIcon, SparkleIcon, TicketIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: SparkleIcon,
    title: "AI trip planning",
    body: "Describe your trip in plain language — a real Claude-powered planner grounds every stop in verified attraction data.",
    href: "/trips/plan",
    cta: "Plan a trip",
  },
  {
    icon: ShieldIcon,
    title: "Safety, built in",
    body: "One-tap SOS, trusted-contact alerts, safe-route scoring, and a live authority command center.",
    href: "/sos",
    cta: "See safety tools",
  },
  {
    icon: CompassIcon,
    title: "Verified local experiences",
    body: "Hotels, guides, and artisans verified through a real KYC workflow — book a service and get a QR ticket.",
    href: "/businesses",
    cta: "Browse businesses",
  },
];

export default async function Home() {
  const [destinations, verifiedBusinesses] = await Promise.all([
    api.listDestinations().catch(() => []),
    api.listBusinesses({ verified_only: true }).catch(() => []),
  ]);
  const stateCount = new Set(destinations.map((d) => d.state).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-16">
      <section className="overflow-hidden rounded-3xl border border-border">
        <div className="grid sm:grid-cols-[1.05fr_.95fr]">
          <div className="flex flex-col gap-6 bg-surface px-8 py-12 sm:px-12 sm:py-16">
            <span className="inline-flex w-fit items-center gap-1.5 text-xs font-bold tracking-[0.25em] text-primary">
              NATIONAL TOURISM INTELLIGENCE
            </span>
            <h1 className="max-w-lg text-4xl leading-[1.08] font-normal text-balance sm:text-5xl">
              Ancient India on the surface.{" "}
              <span className="text-primary">Advanced India</span> underneath.
            </h1>
            <p className="max-w-md text-base text-foreground/65">
              Plan with an AI copilot that reads live crowd, safety and
              accessibility data — then travel with emergency support one tap
              away. Every claim on this page is real: nothing here is a
              mockup.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/trips/plan"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                Plan my journey
                <SparkleIcon width={14} height={14} />
              </Link>
              <Link
                href="/destinations"
                className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-6 py-3 text-sm font-semibold hover:bg-surface-muted"
              >
                Explore India
              </Link>
            </div>
            <div className="mt-2 flex gap-8 border-t border-border pt-5">
              <div>
                <div className="font-display text-2xl">{destinations.length}</div>
                <div className="text-[11px] font-bold tracking-[0.1em] text-muted">DESTINATIONS</div>
              </div>
              <div>
                <div className="font-display text-2xl">{stateCount}</div>
                <div className="text-[11px] font-bold tracking-[0.1em] text-muted">STATES LIVE</div>
              </div>
              <div>
                <div className="font-display text-2xl text-accent">{verifiedBusinesses.length}</div>
                <div className="text-[11px] font-bold tracking-[0.1em] text-muted">VERIFIED BUSINESSES</div>
              </div>
            </div>
          </div>

          <div className="relative min-h-[320px] bg-ink">
            <div className="washed absolute inset-0">
              <Image
                src="/images/heritage-vertical.avif"
                alt=""
                fill
                sizes="(min-width: 640px) 40vw, 100vw"
                className="object-cover opacity-90"
                priority
              />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: "linear-gradient(180deg, rgba(8,26,47,.15) 0%, rgba(8,26,47,.55) 65%, rgba(8,26,47,.92) 100%)",
              }}
            />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-gold/40 bg-ink-2/90 p-4 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-gold">
                <SparkleIcon width={11} height={11} />
                ASK THE AI PLANNER
              </div>
              <p className="mt-2 font-display text-base leading-snug text-[#F5EFE3]">
                &ldquo;Something peaceful and local, 3 days, under ₹15,000.&rdquo;
              </p>
              <Link
                href="/trips/plan"
                className="mt-3 flex items-center justify-center gap-1 rounded-full bg-gold py-2 text-xs font-bold text-ink"
              >
                Create journey
                <ArrowRightIcon width={12} height={12} />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px border-t border-border bg-border sm:grid-cols-3">
          <div className="bg-ink-2 px-6 py-6 text-[#F5EFE3]">
            <div className="font-display text-lg">It plans around you</div>
            <p className="mt-1.5 text-sm text-[#C8D3DE]">
              Budget, pace and interests become a grounded itinerary — reasoning shown, never hidden.
            </p>
          </div>
          <div className="bg-ink-2 px-6 py-6 text-[#F5EFE3]">
            <div className="font-display text-lg">It watches conditions</div>
            <p className="mt-1.5 text-sm text-[#C8D3DE]">
              Real crowd density and safety scores feed route and destination views as they change.
            </p>
          </div>
          <div className="bg-ink-2 px-6 py-6 text-[#F5EFE3]">
            <div className="font-display text-lg">It reaches help</div>
            <p className="mt-1.5 text-sm text-[#C8D3DE]">
              SOS carries your location straight into the authority command centre, with status you can watch.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Link
            key={f.title}
            href={f.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <f.icon width={20} height={20} />
            </span>
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="text-sm text-foreground/65">{f.body}</p>
            <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
              {f.cta}
              <ArrowRightIcon
                width={14}
                height={14}
                className="transition group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-muted p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TicketIcon width={20} height={20} />
          </span>
          <div>
            <h2 className="font-semibold">Book a verified stay or guide</h2>
            <p className="text-sm text-foreground/65">Real availability, a real QR ticket, offline check-in.</p>
          </div>
        </div>
        <Link
          href="/businesses"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          Start browsing
          <ArrowRightIcon width={14} height={14} />
        </Link>
      </section>
    </div>
  );
}
