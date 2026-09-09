import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/layout/PageShell";
import { roleLabel, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — TravIndi" },
      { name: "description", content: "Your TravIndi account, travel preferences and safety settings." },
      { property: "og:title", content: "Your profile — TravIndi" },
      { property: "og:description", content: "Your TravIndi account and preferences." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { me, loading, logout } = useAuth();

  if (loading) {
    return (
      <PageShell eyebrow="Account" title="Your profile">
        <div className="surface-card space-y-4 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-5 w-52" />
        </div>
      </PageShell>
    );
  }

  if (!me) {
    return (
      <PageShell eyebrow="Account" title="Your profile" description="Sign in to view your account.">
        <div className="surface-card flex flex-col items-center gap-4 p-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-lg">🔐</span>
          <p className="text-sm text-muted-foreground">You're not signed in yet.</p>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">Create account</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  const rows: [string, string][] = [
    ["Email", me.email ?? "—"],
    ["Phone", me.phone ?? "—"],
    ["Account type", roleLabel(me.account_type)],
    ["Status", me.status ?? "—"],
    ["Preferred language", me.preferred_language ?? "—"],
  ];

  return (
    <PageShell
      eyebrow="Account"
      title="Your profile"
      description="Loaded live from the TravIndi API."
      actions={
        <Button variant="outline" onClick={logout}>
          Sign out
        </Button>
      }
    >
      <dl className="surface-card divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-6 py-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </PageShell>
  );
}
