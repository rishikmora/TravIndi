"use client";

import { useState } from "react";
import { useAccessibility } from "@/lib/accessibility-context";
import { useAuth } from "@/lib/auth-context";
import { ShieldIcon } from "@/components/icons";

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
    <div className="mx-auto flex max-w-lg flex-col gap-6">
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

      <p className="text-xs text-foreground/45">
        Not built here: voice navigation, audio descriptions, and sign-language support — all
        need real speech/video infrastructure this prototype doesn&apos;t have. Accessible-route
        navigation and accessible-facility listings (elevators, ramps, accessible toilets) are
        real, though — see a destination page&apos;s Facilities section.
      </p>
    </div>
  );
}
