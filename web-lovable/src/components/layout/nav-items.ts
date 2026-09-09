import type { LinkProps } from "@tanstack/react-router";
import { Compass, Home, LifeBuoy, Map, Sparkles, Store, Ticket, Users, ShieldCheck } from "lucide-react";

export interface NavItem {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  icon: typeof Home;
  authOnly?: boolean;
}

export const primaryNav: NavItem[] = [
  { to: "/destinations", label: "Destinations", icon: Compass },
  { to: "/plan", label: "AI Planner", icon: Sparkles },
  { to: "/businesses", label: "Verified Local", icon: Store },
  { to: "/guides", label: "Guides", icon: Users },
  { to: "/sos", label: "Safety", icon: LifeBuoy },
];

export const accountNav: NavItem[] = [
  { to: "/trips", label: "My trips", icon: Map, authOnly: true },
  { to: "/bookings", label: "Bookings", icon: Ticket, authOnly: true },
  { to: "/report", label: "Report an incident", icon: ShieldCheck },
  { to: "/accessibility", label: "Accessibility", icon: Users },
];

export const mobileTabs: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/destinations", label: "Explore", icon: Compass },
  { to: "/plan", label: "Plan", icon: Sparkles },
  { to: "/trips", label: "Trips", icon: Map },
  { to: "/sos", label: "SOS", icon: LifeBuoy },
];
