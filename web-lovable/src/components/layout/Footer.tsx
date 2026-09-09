import { Link, type LinkProps } from "@tanstack/react-router";
import { Logo } from "./Logo";

const columns: { title: string; links: { to: NonNullable<LinkProps["to"]>; label: string }[] }[] = [
  {
    title: "Travel",
    links: [
      { to: "/destinations", label: "Destinations" },
      { to: "/plan", label: "AI trip planner" },
      { to: "/trips", label: "My trips" },
      { to: "/bookings", label: "Bookings" },
    ],
  },
  {
    title: "Safety",
    links: [
      { to: "/sos", label: "Emergency SOS" },
      { to: "/report", label: "Report an incident" },
      { to: "/accessibility", label: "Accessible travel" },
    ],
  },
  {
    title: "Partners & authorities",
    links: [
      { to: "/businesses", label: "Verified businesses" },
      { to: "/guides", label: "Licensed guides" },
      { to: "/authority", label: "Authority console" },
      { to: "/authority/analytics", label: "Tourism analytics" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            AI-powered travel for India, with tourist safety built into the core — verified locals,
            grounded itineraries, and one-tap help.
          </p>
          <p className="text-xs text-muted-foreground">Smart India Hackathon · Problem 26204</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} TravIndi. Built for safer journeys.</span>
          <span>In an emergency, always call 112.</span>
        </div>
      </div>
    </footer>
  );
}
