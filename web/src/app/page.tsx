import Link from "next/link";
import { ArrowRightIcon, CompassIcon, MapPinIcon, ShieldIcon, SparkleIcon, TicketIcon } from "@/components/icons";

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

export default function Home() {
  return (
    <div className="flex flex-col gap-16">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface px-6 py-14 sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <SparkleIcon width={14} height={14} />
            SIH 26204 — smart tourism & safety
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Explore India further — with an AI planner and a safety net that
            travels with you.
          </h1>
          <p className="max-w-xl text-base text-foreground/70">
            Plan grounded, personalized itineraries; navigate with crowd- and
            safety-aware routing; and reach help in one tap. Every business you
            book is verified, every claim is real — nothing here is a mockup.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/trips/plan"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Plan with AI
              <ArrowRightIcon width={16} height={16} />
            </Link>
            <Link
              href="/destinations"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium hover:bg-surface-muted"
            >
              <MapPinIcon width={16} height={16} />
              Explore destinations
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm font-medium text-foreground/70 hover:text-foreground"
            >
              Create an account
            </Link>
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
