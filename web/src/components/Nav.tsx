"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CompassIcon, MapPinIcon } from "@/components/icons";

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground/70 hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function MoreMenu({ token }: { token: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const items: { href: string; label: string }[] = token
    ? [
        { href: "/profile", label: "My Profile" },
        { href: "/ai/guide", label: "AI Tourist Guide" },
        { href: "/ai/translate", label: "Translate" },
        { href: "/accessibility", label: "Accessibility" },
        { href: "/gamification", label: "Travel Passport" },
        { href: "/lost-found", label: "Lost & Found" },
        { href: "/report", label: "Report an incident" },
        { href: "/trust/fraud", label: "Fraud reports" },
        { href: "/trusted-contacts", label: "Trusted contacts" },
        { href: "/notifications", label: "Notifications" },
        { href: "/consents", label: "Privacy" },
        { href: "/authority", label: "Authority" },
        { href: "/authority/analytics", label: "Analytics" },
        { href: "/authority/admin", label: "Administration" },
      ]
    : [
        { href: "/ai/guide", label: "AI Tourist Guide" },
        { href: "/ai/translate", label: "Translate" },
        { href: "/accessibility", label: "Accessibility" },
      ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-3 py-1.5 text-foreground/70 transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        More
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-foreground/80 hover:bg-surface-muted"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const { token, me, loading, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 text-sm sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center border-[1.5px] border-primary text-primary"
            style={{ borderRadius: "13px 13px 3px 3px" }}
          >
            <CompassIcon width={15} height={15} />
          </span>
          <span className="font-display text-lg tracking-wide">TravIndi</span>
          <span className="hidden rounded-[4px] border border-border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em] text-muted sm:inline">
            SIH 26204
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <NavLink href="/destinations">Destinations</NavLink>
          <NavLink href="/routes">Safe routes</NavLink>
          <NavLink href="/businesses">Businesses</NavLink>
          <NavLink href="/guides">Guides</NavLink>
          {token && <NavLink href="/trips">My trips</NavLink>}
          {token && <NavLink href="/bookings">My bookings</NavLink>}
        </div>

        <div className="flex items-center gap-2">
          {token && (
            <Link
              href="/sos"
              className="flex items-center gap-1 rounded-full bg-danger/10 px-3 py-1.5 font-semibold text-danger hover:bg-danger/15"
            >
              <MapPinIcon width={15} height={15} />
              SOS
            </Link>
          )}
          <MoreMenu token={token} />
          {loading ? null : token ? (
            <div className="flex items-center gap-2 pl-2">
              <Link
                href="/profile"
                className="hidden text-foreground/60 hover:text-foreground sm:inline"
              >
                {me?.email ?? "Signed in"}
              </Link>
              <button
                onClick={logout}
                className="rounded-full border border-border px-3 py-1.5 text-foreground/70 hover:bg-surface-muted"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2">
              <Link href="/login" className="rounded-full px-3 py-1.5 text-foreground/70 hover:bg-surface-muted">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground hover:opacity-90"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
