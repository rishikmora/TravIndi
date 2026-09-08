"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type TrustedContact } from "@/lib/api";

function TrustedContactsPanel() {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<TrustedContact[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listTrustedContacts(token).then(setContacts).catch(() => setError("Could not load trusted contacts."));
  }, [token]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const contact = await api.addTrustedContact(
        { name, phone: phone || undefined, email: email || undefined },
        token
      );
      setContacts((c) => [...(c ?? []), contact]);
      setName("");
      setPhone("");
      setEmail("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not add trusted contact.");
    }
  }

  async function onRemove(id: string) {
    if (!token) return;
    try {
      await api.removeTrustedContact(id, token);
      setContacts((c) => (c ?? []).filter((x) => x.id !== id));
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not remove contact.");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-semibold">Trusted contacts</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Registered contacts get a one-time access token whenever you trigger an SOS, so they can check on you
        without needing an account of their own.
      </p>

      {contacts === null && !error && <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {contacts && contacts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded border border-black/10 p-3 text-sm dark:border-white/15"
            >
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-black/60 dark:text-white/60">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
              </div>
              <button onClick={() => onRemove(c.id)} className="text-xs underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-col gap-3 rounded border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium">Add a contact</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          required
          className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button type="submit" className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background">
          Add contact
        </button>
      </form>
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
