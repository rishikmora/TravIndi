import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { useAuth, type AccountType } from "@/lib/auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your account — TravIndi" },
      { name: "description", content: "Sign up as a tourist, guide or local business on TravIndi." },
      { property: "og:title", content: "Create your account — TravIndi" },
      { property: "og:description", content: "Sign up as a tourist, guide or local business." },
    ],
  }),
  component: RegisterPage,
});

const accountTypes: { value: AccountType; title: string; body: string }[] = [
  { value: "tourist", title: "Tourist", body: "Plan trips, book verified services, travel safely." },
  { value: "guide", title: "Guide", body: "Get KYC-verified and take guided-tour bookings." },
  { value: "business", title: "Business", body: "List stays, transport, food and experiences." },
];

function RegisterPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>("tourist");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim() && !phone.trim()) errs['email'] = "Enter an email address or a phone number.";
    else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs['email'] = "That email address doesn't look right.";
    if (password.length < 8) errs['password'] = "Use at least 8 characters.";
    if (password !== confirm) errs['confirm'] = "Passwords don't match.";
    return errs;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const credentials = {
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        password,
      };
      await register({ ...credentials, account_type: accountType });
      toast.success("Account created — signing you in");
      const user = await login(credentials).catch(() => null);
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
    <div className="mx-auto flex w-full max-w-lg flex-col px-5 py-14">
      <h1 className="text-3xl font-semibold text-balance-tight">Create your TravIndi account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Authority accounts (police, tourism department) are provisioned separately — not via signup.
      </p>

      <form onSubmit={onSubmit} noValidate className="surface-card mt-8 space-y-6 p-6">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">I am a…</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {accountTypes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setAccountType(t.value)}
                aria-pressed={accountType === t.value}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  accountType === t.value
                    ? "border-primary bg-primary/8 ring-1 ring-primary"
                    : "border-border hover:bg-secondary",
                )}
              >
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t.body}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors['email'])}
          />
          {fieldErrors['email'] && <p className="text-xs text-destructive">{fieldErrors['email']}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(fieldErrors['phone'])}
          />
          {fieldErrors['phone'] && <p className="text-xs text-destructive">{fieldErrors['phone']}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors['password'])}
            />
            {fieldErrors['password'] && (
              <p className="text-xs text-destructive">{fieldErrors['password']}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(fieldErrors['confirm'])}
            />
            {fieldErrors['confirm'] && <p className="text-xs text-destructive">{fieldErrors['confirm']}</p>}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
