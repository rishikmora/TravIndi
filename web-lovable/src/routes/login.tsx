import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — TravIndi" },
      { name: "description", content: "Sign in to your TravIndi account to plan trips, manage bookings and access safety tools." },
      { property: "og:title", content: "Log in — TravIndi" },
      { property: "og:description", content: "Sign in to TravIndi." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!email.trim()) return setFieldErrors({ email: "Enter your email or phone number." });
    if (!password) return setFieldErrors({ password: "Enter your password." });

    setSubmitting(true);
    try {
      const isPhone = /^[+0-9][0-9\s-]{6,}$/.test(email.trim());
      const user = await login({
        [isPhone ? "phone" : "email"]: email.trim(),
        password,
      } as { email?: string; phone?: string; password: string });
      toast.success("Welcome back to TravIndi");
      void navigate({ to: user?.account_type?.startsWith("authority_") ? "/authority" : "/" });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-14">
      <h1 className="text-3xl font-semibold text-balance-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to continue planning, booking and travelling safely.
      </p>

      <form onSubmit={onSubmit} noValidate className="surface-card mt-8 space-y-5 p-6">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email or phone</Label>
          <Input
            id="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test-tourist@example.com"
            aria-invalid={Boolean(fieldErrors['email'] || fieldErrors['phone'])}
          />
          {(fieldErrors['email'] || fieldErrors['phone']) && (
            <p className="text-xs text-destructive">{fieldErrors['email'] ?? fieldErrors['phone']}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors['password'])}
          />
          {fieldErrors['password'] && <p className="text-xs text-destructive">{fieldErrors['password']}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? "Signing in…" : "Log in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New to TravIndi?{" "}
          <Link to="/register" className="font-medium text-primary">
            Create an account
          </Link>
        </p>
      </form>

      <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Demo accounts (password Test1234!)</p>
        <ul className="mt-2 space-y-1">
          <li>test-tourist@example.com — tourist</li>
          <li>test-police@example.com — police authority</li>
          <li>test-admin@example.com — platform admin</li>
        </ul>
      </div>
    </div>
  );
}
