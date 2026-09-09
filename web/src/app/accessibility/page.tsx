"use client";

import { useEffect, useState } from "react";
import { useAccessibility } from "@/lib/accessibility-context";
import { useAuth } from "@/lib/auth-context";
import { api, type AccessibilityNeed, type TravelerType, type TravelPreferences } from "@/lib/api";
import { ShieldIcon, UsersIcon } from "@/components/icons";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-foreground/60">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-primary"
      />
    </label>
  );
}

const TRAVELER_TYPES: { value: TravelerType; label: string; description: string }[] = [
  { value: "SOLO", label: "Solo / standard", description: "A regular personalized experience." },
  { value: "ACCESSIBILITY", label: "Accessibility needs", description: "Prioritize accessible attractions, routes & facilities." },
  { value: "FAMILY", label: "Family", description: "Prioritize family-appropriate pacing & lower-crowd picks." },
];

const NEEDS: { value: AccessibilityNeed; label: string }[] = [
  { value: "WHEELCHAIR", label: "Wheelchair user" },
  { value: "VISUAL_IMPAIRMENT", label: "Visual impairment" },
  { value: "HEARING_IMPAIRMENT", label: "Hearing impairment" },
  { value: "REDUCED_MOBILITY", label: "Reduced mobility" },
];

const DEFAULT_TRAVEL_PREFS: TravelPreferences = {
  traveler_type: "SOLO",
  accessibility_needs: [],
  family_children_count: 0,
  family_seniors_count: 0,
};

function TravelProfileSection() {
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<TravelPreferences>(DEFAULT_TRAVEL_PREFS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getTravelPreferences(token).then(setPrefs).catch(() => {});
  }, [token]);

  function toggleNeed(need: AccessibilityNeed) {
    setPrefs((prev) => ({
      ...prev,
      accessibility_needs: prev.accessibility_needs.includes(need)
        ? prev.accessibility_needs.filter((n) => n !== need)
        : [...prev.accessibility_needs, need],
    }));
  }

  async function onSave() {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    try {
      const result = await api.setTravelPreferences(prefs, token);
      setPrefs(result);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-foreground/60">
        Log in to set a standing travel profile — the AI planner uses it automatically on every
        trip so you don&apos;t have to restate your needs each time.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {TRAVELER_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setPrefs((prev) => ({ ...prev, traveler_type: t.value }))}
            className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
              prefs.traveler_type === t.value
                ? "border-primary bg-primary/10"
                : "border-border bg-surface hover:bg-surface-muted"
            }`}
          >
            <span className="text-sm font-medium">{t.label}</span>
            <span className="text-xs text-foreground/60">{t.description}</span>
          </button>
        ))}
      </div>

      {prefs.traveler_type === "ACCESSIBILITY" && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-muted p-3">
          {NEEDS.map((n) => (
            <label
              key={n.value}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                prefs.accessibility_needs.includes(n.value)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-foreground/70"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={prefs.accessibility_needs.includes(n.value)}
                onChange={() => toggleNeed(n.value)}
              />
              {n.label}
            </label>
          ))}
        </div>
      )}

      {prefs.traveler_type === "FAMILY" && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <label className="flex items-center gap-2">
            Children
            <input
              type="number"
              min={0}
              max={20}
              value={prefs.family_children_count}
              onChange={(e) => setPrefs((prev) => ({ ...prev, family_children_count: Number(e.target.value) }))}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            Seniors
            <input
              type="number"
              min={0}
              max={20}
              value={prefs.family_seniors_count}
              onChange={(e) => setPrefs((prev) => ({ ...prev, family_seniors_count: Number(e.target.value) }))}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1"
            />
          </label>
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saving}
        className="w-fit rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save travel profile"}
      </button>
      {saved && <p className="text-sm text-success">Saved — every future AI-planned trip will use this automatically.</p>}
    </div>
  );
}

export default function AccessibilityPage() {
  const { token } = useAuth();
  const { preferences, update } = useAccessibility();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onChange(patch: Partial<typeof preferences>) {
    setSaving(true);
    setSaved(false);
    try {
      await update({ ...preferences, ...patch });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <ShieldIcon width={20} height={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accessibility</h1>
          <p className="text-sm text-foreground/60">
            These change the site for real — not just a saved preference.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Toggle
          label="High contrast"
          description="Pure black background, white text, high-visibility accents."
          checked={preferences.high_contrast}
          onChange={(v) => onChange({ high_contrast: v })}
        />
        <Toggle
          label="Large text"
          description="Scales all text on the site up by about a fifth."
          checked={preferences.large_text}
          onChange={(v) => onChange({ large_text: v })}
        />
        <Toggle
          label="Reduce motion"
          description="Turns off animations and transitions across the site."
          checked={preferences.reduce_motion}
          onChange={(v) => onChange({ reduce_motion: v })}
        />
      </div>

      {saving && <p className="text-sm text-foreground/50">Saving…</p>}
      {!saving && saved && (
        <p className="text-sm text-success">
          Saved{token ? "" : " on this device"} — try switching pages to see it stick.
        </p>
      )}
      {!token && (
        <p className="text-xs text-foreground/50">
          Log in to keep these settings across devices — for now they&apos;re saved to this
          browser only.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UsersIcon width={20} height={20} />
          </span>
          <div>
            <h2 className="font-semibold">Travel profile</h2>
            <p className="text-sm text-foreground/60">
              Who you&apos;re usually traveling with — the AI planner, routes, and business search
              adapt to this automatically.
            </p>
          </div>
        </div>
        <TravelProfileSection />
      </div>

      <p className="text-xs text-foreground/45">
        Not built here: voice navigation, audio descriptions, and sign-language support — all
        need real speech/video infrastructure this prototype doesn&apos;t have. Accessible-route
        navigation, accessible-facility listings, and disability-aware trip planning are real,
        though — see a destination page&apos;s Facilities section, the Safe Routes accessible
        mode, and Plan with AI.
      </p>
    </div>
  );
}
