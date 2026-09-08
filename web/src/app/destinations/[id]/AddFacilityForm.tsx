"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type FacilityType } from "@/lib/api";

const FACILITY_TYPES: FacilityType[] = [
  "WHEELCHAIR_RAMP",
  "ACCESSIBLE_TOILET",
  "ELEVATOR",
  "ACCESSIBLE_PARKING",
  "FIRST_AID",
  "INFORMATION_DESK",
  "DRINKING_WATER",
  "OTHER",
];

export function AddFacilityForm({ destinationId, lon, lat }: { destinationId: string; lon: number; lat: number }) {
  const { token, me } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [facilityType, setFacilityType] = useState<FacilityType>("ELEVATOR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token || me?.account_type !== "authority") return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createFacility(destinationId, { name, facility_type: facilityType, lon, lat }, token);
      setName("");
      router.refresh();
    } catch (err) {
      setError(
        isApiError(err) && err.status === 403
          ? "Only a tourism-department authority account can add facility records."
          : isApiError(err)
            ? err.message
            : "Could not add this facility."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-muted p-3 text-xs">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Facility name"
        className="rounded border border-border bg-background px-2 py-1"
      />
      <select
        value={facilityType}
        onChange={(e) => setFacilityType(e.target.value as FacilityType)}
        className="rounded border border-border bg-background px-2 py-1"
      >
        {FACILITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add facility"}
      </button>
      {error && <p className="w-full text-danger">{error}</p>}
    </form>
  );
}
