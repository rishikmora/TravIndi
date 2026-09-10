"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type TrustedContact } from "@/lib/api";
import { PhoneIcon, UsersIcon } from "@/components/icons";

function TrustedContactsPanel() {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<TrustedContact[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listTrustedContacts(token).then(setContacts).catch(() => setError("Could not load trusted contacts."));
  }, [token]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const contact = await api.addTrustedContact(
        { name, relationship_label: relationship || undefined, phone: phone || undefined, email: email || undefined },
        token
      );
      setContacts((c) => [...(c ?? []), contact]);
      setName("");
      setRelationship("");
      setPhone("");
      setEmail("");
      setOpen(false);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not add trusted contact.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(id: string) {
    if (!token) return;
    setRemovingId(id);
    try {
      await api.removeTrustedContact(id, token);
      setContacts((c) => (c ?? []).filter((x) => x.id !== id));
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not remove contact.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Trusted contacts</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Every contact here gets a real, one-time access link whenever you trigger an SOS — they can check on you
          without needing an account of their own.
        </p>
      </div>

      {contacts === null && !error && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
              <div className="h-4 w-1/2 rounded bg-surface-muted" />
              <div className="mt-2 h-3 w-1/3 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {contacts?.length === 0 && !open && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
          <UsersIcon width={26} height={26} className="text-foreground/30" />
          <p className="text-sm text-foreground/60">No trusted contacts yet — add one before you need them.</p>
        </div>
      )}

      {contacts && contacts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <UsersIcon width={15} height={15} />
                </span>
                <div>
                  <div className="font-medium">
                    {c.name}
                    {c.relationship_label && <span className="ml-1.5 text-xs font-normal text-foreground/50">· {c.relationship_label}</span>}
                  </div>
                  {(c.phone || c.email) && (
                    <div className="flex items-center gap-1 text-xs text-foreground/55">
                      {c.phone && <PhoneIcon width={11} height={11} />}
                      {[c.phone, c.email].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => onRemove(c.id)}
                disabled={removingId === c.id}
                className="text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
              >
                {removingId === c.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form onSubmit={onAdd} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Add a contact</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            required
            autoFocus
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Relationship (e.g. Spouse, Parent) — optional"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !name}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Adding…" : "Add contact"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-foreground/50 hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="self-start rounded-full border border-dashed border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:border-primary hover:text-primary"
        >
          + Add a trusted contact
        </button>
      )}
    </div>
  );
}

export default function TrustedContactsPage() {
  return (
    <RequireAuth>
      <TrustedContactsPanel />
    </RequireAuth>
  );
}
