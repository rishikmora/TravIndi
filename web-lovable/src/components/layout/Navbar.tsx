import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, ShieldAlert, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isAuthority, roleLabel, useAuth } from "@/lib/auth";
import { Logo } from "./Logo";
import { accountNav, primaryNav } from "./nav-items";

function initials(value?: string | null) {
  if (!value) return "TI";
  return value.slice(0, 2).toUpperCase();
}

export function Navbar() {
  const { me, token, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signedIn = Boolean(token && me);

  const handleLogout = () => {
    logout();
    void navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {primaryNav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-destructive hover:bg-destructive/10 hover:text-destructive sm:inline-flex"
          >
            <Link to="/sos">
              <ShieldAlert className="size-4" />
              SOS
            </Link>
          </Button>

          {loading ? (
            <Skeleton className="h-9 w-24 rounded-lg" />
          ) : signedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium transition-shadow hover:shadow-soft">
                  <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {initials(me?.email ?? me?.phone)}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">{me?.email ?? me?.phone}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="space-y-0.5">
                  <span className="block truncate text-sm">{me?.email ?? me?.phone}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {roleLabel(me?.account_type)}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <User className="size-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                {accountNav
                  .filter((i) => i.authOnly)
                  .map((i) => (
                    <DropdownMenuItem key={i.to} asChild>
                      <Link to={i.to}>
                        <i.icon className="size-4" /> {i.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                {isAuthority(me?.account_type) && (
                  <DropdownMenuItem asChild>
                    <Link to="/authority">
                      <ShieldAlert className="size-4" /> Authority console
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">Get started</Link>
              </Button>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86%] max-w-sm p-0">
              <div className="flex h-full flex-col gap-6 overflow-y-auto px-5 py-6">
                <Logo />
                <nav className="space-y-1">
                  {primaryNav.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary"
                    >
                      <item.icon className="size-4 text-primary" />
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="border-t border-border pt-4">
                  <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Your account
                  </p>
                  <nav className="space-y-1">
                    {accountNav.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-secondary"
                      >
                        <item.icon className="size-4 text-accent" />
                        {item.label}
                      </Link>
                    ))}
                    {isAuthority(me?.account_type) && (
                      <Link
                        to="/authority"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-secondary"
                      >
                        <ShieldAlert className="size-4 text-accent" /> Authority console
                      </Link>
                    )}
                  </nav>
                </div>
                <div className="mt-auto space-y-2">
                  {signedIn ? (
                    <Button variant="outline" className="w-full" onClick={handleLogout}>
                      <LogOut className="size-4" /> Sign out
                    </Button>
                  ) : (
                    <>
                      <Button asChild className="w-full" onClick={() => setOpen(false)}>
                        <Link to="/register">Create account</Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full" onClick={() => setOpen(false)}>
                        <Link to="/login">Log in</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
