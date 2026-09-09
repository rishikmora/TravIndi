import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, LifeBuoy, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1800&q=80";

export const Route = createFileRoute("/")({
  component: Home,
});

const pillars = [
  {
    icon: Sparkles,
    title: "Grounded AI planner",
    body: "Claude-powered itineraries built on real attraction, timing and travel data — not a generic chatbot guess.",
    to: "/plan" as const,
    cta: "Plan a trip",
  },
  {
    icon: LifeBuoy,
    title: "Safety in the core",
    body: "One-tap SOS, trusted contacts and safe-route scoring, connected to real police and responder dashboards.",
    to: "/sos" as const,
    cta: "See safety tools",
  },
  {
    icon: BadgeCheck,
    title: "Verified locals only",
    body: "Every guide and business clears a real KYC workflow, and reviews carry an AI authenticity signal.",
    to: "/businesses" as const,
    cta: "Browse verified",
  },
];

function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <img
          src={HERO_IMAGE}
          alt="Traveller looking out over a palace lake at sunset in Rajasthan, India"
          className="absolute inset-0 -z-10 size-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,oklch(0.19_0.015_267/0.92)_10%,oklch(0.19_0.015_267/0.55)_55%,oklch(0.19_0.015_267/0.25)_100%)]" />
        <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:py-32 lg:py-40">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-primary-foreground backdrop-blur">
              <Star className="size-3.5 fill-current" />
              SIH 26204 · Smart tourism & tourist safety
            </span>
            <h1 className="mt-6 text-4xl font-bold text-balance-tight text-primary-foreground sm:text-6xl">
              Travel India boldly. Stay safe by design.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-primary-foreground/85">
              TravIndi plans your journey with real, grounded AI — then keeps you protected with
              one-tap SOS, live safe-route scoring and only KYC-verified guides and businesses.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/plan">
                  Plan my trip with AI <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-white/10 text-primary-foreground backdrop-blur hover:bg-white/20 hover:text-primary-foreground"
              >
                <Link to="/destinations">Explore destinations</Link>
              </Button>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/20 pt-6">
              {[
                ["112", "Emergency linked"],
                ["100%", "KYC-verified partners"],
                ["24/7", "Safety monitoring"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-semibold text-primary-foreground">{value}</dt>
                  <dd className="text-xs text-primary-foreground/70">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold text-balance-tight sm:text-4xl">
            A tourist-safety platform first, a travel app second.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Three things power every screen in TravIndi. Destination discovery, bookings and the
            authority console build on top of them.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {pillars.map((p) => (
            <article key={p.title} className="surface-card group flex flex-col p-6 transition-shadow hover:shadow-lift">
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-accent">
                <p.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.body}</p>
              <Link
                to={p.to}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
              >
                {p.cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-8">
        <div className="surface-card flex flex-col items-start gap-5 overflow-hidden bg-accent p-8 text-accent-foreground sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold">Are you a guide, business or authority?</h2>
            <p className="mt-2 text-sm opacity-90">
              Register to get KYC-verified and take bookings, or sign in to the authority console for
              the live safety dashboard, verification queue and tourism analytics.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="secondary">
              <Link to="/register">Register</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-current bg-transparent text-accent-foreground hover:bg-white/15 hover:text-accent-foreground"
            >
              <Link to="/authority">Authority console</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
