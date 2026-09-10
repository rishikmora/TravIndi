"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  type LostItem,
  type FoundItem,
  type LostFoundMatchEntry,
  type LostFoundCategory,
} from "@/lib/api";
import { SparkleIcon, MapPinIcon, CalendarIcon } from "@/components/icons";

const CATEGORIES: LostFoundCategory[] = ["ELECTRONICS", "DOCUMENTS", "BAG_LUGGAGE", "CLOTHING", "JEWELRY", "OTHER"];

function statusTone(status: string) {
  if (["RESOLVED", "RETURNED", "CONFIRMED"].includes(status)) return "bg-success/10 text-success";
  if (status === "MATCHED") return "bg-primary/10 text-primary";
  if (status === "REJECTED" || status === "CLOSED") return "bg-danger/10 text-danger";
  return "bg-surface-muted text-foreground/60";
}

function ReportForm({ kind, onCreated }: { kind: "lost" | "found"; onCreated: () => void }) {
  const { token } = useAuth();
  const [category, setCategory] = useState<LostFoundCategory>("OTHER");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (kind === "lost") {
        await api.reportLostItem({ category, title, description, lost_at: now }, token);
      } else {
        await api.reportFoundItem(
          { category, title, description, found_at: now, storage_location: storageLocation || undefined },
          token
        );
      }
      setTitle("");
      setDescription("");
      setStorageLocation("");
      setSuccess(
        kind === "lost"
          ? "Reported — we've searched for a real match against found items with the same category."
          : "Reported — thank you. We've checked for a real match against open lost-item reports."
      );
      onCreated();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit this report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as LostFoundCategory)}
            className="rounded-xl border border-border bg-background px-3 py-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder={kind === "lost" ? "e.g. Black Sony camera" : "e.g. Sony camera found"}
            className="rounded-xl border border-border bg-background px-3 py-2"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          maxLength={4000}
          placeholder="Be specific — color, brand, distinguishing marks, where and roughly when. Real matching compares this text."
          className="rounded-xl border border-border bg-background px-3 py-2"
        />
      </label>
      {kind === "found" && (
        <label className="flex flex-col gap-1 text-sm">
          Where is it being held? (optional)
          <input
            value={storageLocation}
            onChange={(e) => setStorageLocation(e.target.value)}
            maxLength={300}
            placeholder="e.g. Agra Tourist Police Station"
            className="rounded-xl border border-border bg-background px-3 py-2"
          />
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-success">{success}</p>}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Submitting…" : kind === "lost" ? "Report lost item" : "Report found item"}
      </button>
    </form>
  );
}

function MatchCard({ match, onDecided }: { match: LostFoundMatchEntry; onDecided: () => void }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "confirm" | "reject") {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "confirm") await api.confirmMatch(match.id, token);
      else await api.rejectMatch(match.id, token);
      onDecided();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not update this match.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{match.found_item.title}</div>
          <p className="mt-1 text-sm text-foreground/60">{match.found_item.description}</p>
          {match.found_item.storage_location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-foreground/50">
              <MapPinIcon width={12} height={12} />
              {match.found_item.storage_location}
            </p>
          )}
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <SparkleIcon width={12} height={12} />
          {Math.round(match.similarity_score * 100)}% match
        </span>
      </div>
      {match.status === "SUGGESTED" ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => decide("confirm")}
            disabled={busy}
            className="rounded-lg bg-success/10 px-3 py-1.5 text-sm font-medium text-success disabled:opacity-50"
          >
            This is mine
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={busy}
            className="rounded-lg bg-surface-muted px-3 py-1.5 text-sm text-foreground/70 disabled:opacity-50"
          >
            Not a match
          </button>
        </div>
      ) : (
        <span className={`mt-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase ${statusTone(match.status)}`}>
          {match.status}
        </span>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </li>
  );
}

function LostItemRow({ item }: { item: LostItem }) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [matches, setMatches] = useState<LostFoundMatchEntry[] | null>(null);

  function loadMatches() {
    if (!token) return;
    api.listMatchesForLostItem(item.id, token).then(setMatches).catch(() => setMatches([]));
  }

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{item.title}</div>
          <p className="mt-1 text-sm text-foreground/60">{item.description}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-foreground/45">
            <CalendarIcon width={12} height={12} />
            Lost {new Date(item.lost_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium uppercase ${statusTone(item.status)}`}>
          {item.status}
        </span>
      </div>
      <button
        onClick={() => {
          setExpanded((v) => !v);
          if (!matches) loadMatches();
        }}
        className="mt-3 text-sm font-medium text-primary"
      >
        {expanded ? "Hide suggested matches" : "View suggested matches"}
      </button>
      {expanded && (
        <div className="mt-3">
          {matches === null && <p className="text-sm text-foreground/60">Loading…</p>}
          {matches?.length === 0 && <p className="text-sm text-foreground/60">No matches yet — real matching runs automatically as new found items come in.</p>}
          {matches && matches.length > 0 && (
            <ul className="flex flex-col gap-2">
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} onDecided={loadMatches} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function FoundItemCard({
  item,
  mine,
  onReturned,
}: {
  item: FoundItem;
  mine?: boolean;
  onReturned?: () => void;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onMarkReturned() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.markFoundItemReturned(item.id, token);
      onReturned?.();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not mark this returned.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{item.title}</div>
          <p className="mt-1 text-sm text-foreground/60">{item.description}</p>
          {item.storage_location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-foreground/45">
              <MapPinIcon width={12} height={12} />
              {item.storage_location}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground/60">
            {item.category.replace("_", " ")}
          </span>
          {mine && (
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium uppercase ${statusTone(item.status)}`}>
              {item.status}
            </span>
          )}
        </div>
      </div>
      {mine && item.status === "CLAIMED" && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="text-xs text-foreground/55">Someone confirmed this is theirs — mark it returned once you&apos;ve handed it back.</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            onClick={onMarkReturned}
            disabled={busy}
            className="self-start rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success disabled:opacity-50"
          >
            {busy ? "Marking…" : "Mark as returned"}
          </button>
        </div>
      )}
    </li>
  );
}

function LostFoundHome() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"report-lost" | "report-found" | "my-lost" | "my-found" | "browse-found">(
    "report-lost"
  );
  const [myLostItems, setMyLostItems] = useState<LostItem[] | null>(null);
  const [myFoundItems, setMyFoundItems] = useState<FoundItem[] | null>(null);
  const [foundItems, setFoundItems] = useState<FoundItem[] | null>(null);

  function refreshMyLostReports() {
    if (!token) return;
    api.listMyLostItems(token).then(setMyLostItems).catch(() => setMyLostItems([]));
  }

  function refreshMyFoundReports() {
    if (!token) return;
    api.listMyFoundItems(token).then(setMyFoundItems).catch(() => setMyFoundItems([]));
  }

  useEffect(() => {
    if (tab === "my-lost") refreshMyLostReports();
    if (tab === "my-found") refreshMyFoundReports();
    if (tab === "browse-found") api.listFoundItems().then(setFoundItems).catch(() => setFoundItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "report-lost", label: "Report lost item" },
    { id: "report-found", label: "Report found item" },
    { id: "my-lost", label: "My lost reports" },
    { id: "my-found", label: "My found reports" },
    { id: "browse-found", label: "Browse found items" },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lost &amp; Found</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real text-similarity matching between lost and found reports — a suggested match is never final until you confirm it.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full bg-surface-muted p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 transition ${
              tab === t.id ? "bg-surface font-medium shadow-sm" : "text-foreground/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "report-lost" && <ReportForm kind="lost" onCreated={refreshMyLostReports} />}
      {tab === "report-found" && <ReportForm kind="found" onCreated={refreshMyFoundReports} />}

      {tab === "my-lost" && (
        <div>
          {myLostItems === null && <p className="text-sm text-foreground/60">Loading…</p>}
          {myLostItems?.length === 0 && <p className="text-sm text-foreground/60">You haven&apos;t reported anything lost.</p>}
          {myLostItems && myLostItems.length > 0 && (
            <ul className="flex flex-col gap-3">
              {myLostItems.map((item) => (
                <LostItemRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "my-found" && (
        <div>
          {myFoundItems === null && <p className="text-sm text-foreground/60">Loading…</p>}
          {myFoundItems?.length === 0 && <p className="text-sm text-foreground/60">You haven&apos;t reported anything found.</p>}
          {myFoundItems && myFoundItems.length > 0 && (
            <ul className="flex flex-col gap-3">
              {myFoundItems.map((item) => (
                <FoundItemCard key={item.id} item={item} mine onReturned={refreshMyFoundReports} />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "browse-found" && (
        <div>
          {foundItems === null && <p className="text-sm text-foreground/60">Loading…</p>}
          {foundItems?.length === 0 && <p className="text-sm text-foreground/60">No open found-item reports right now.</p>}
          {foundItems && foundItems.length > 0 && (
            <ul className="flex flex-col gap-3">
              {foundItems.map((item) => (
                <FoundItemCard key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function LostFoundPage() {
  return (
    <RequireAuth>
      <LostFoundHome />
    </RequireAuth>
  );
}
