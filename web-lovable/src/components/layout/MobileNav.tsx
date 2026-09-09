import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { mobileTabs } from "./nav-items";

export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {mobileTabs.map((tab) => {
          const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
          const isSos = tab.to === "/sos";
          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={tab.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                  isSos && "text-destructive",
                )}
              >
                <tab.icon className={cn("size-5", active && "scale-110 transition-transform")} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
