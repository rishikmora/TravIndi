'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { isApiError } from '@/lib/api/errors';
import { useReplan } from '@/lib/query/hooks/trips';
import type { AdaptationProposal, ReplanPreset } from '@/types/domain';

const PRESETS: Array<{ value: ReplanPreset; label: string }> = [
  { value: 'more_relaxed', label: 'More relaxed' },
  { value: 'less_walking', label: 'Less walking' },
  { value: 'avoid_crowds', label: 'Avoid crowds' },
  { value: 'cheaper', label: 'Cheaper' },
  { value: 'more_heritage', label: 'More heritage' },
  { value: 'more_food', label: 'More food' },
  { value: 'improve_safety', label: 'Safer choices' },
];

interface ReplanSheetProps {
  tripId: string;
  open: boolean;
  currentVersion: number | null;
  days: number[];
  onClose: () => void;
  onProposal: (proposal: AdaptationProposal) => void;
}

/** Ask for a change. The result is a proposal that goes through the same review — nothing is applied directly. */
export function ReplanSheet({ tripId, open, currentVersion, days, onClose, onProposal }: ReplanSheetProps) {
  const [presets, setPresets] = useState<ReplanPreset[]>([]);
  const [instruction, setInstruction] = useState('');
  const [day, setDay] = useState('');
  const replan = useReplan(tripId);

  const submit = () => {
    if (currentVersion === null) return;
    replan.mutate(
      { basedOnVersion: currentVersion, presets, instruction: instruction.trim() || null, scope: { dayNumber: day ? Number(day) : null, itemId: null } },
      {
        onSuccess: (proposal) => {
          setPresets([]);
          setInstruction('');
          setDay('');
          onProposal(proposal);
        },
      },
    );
  };

  const error = replan.error;
  // The backend explains when it cannot honestly make a change (e.g. no price data); show its words.
  const refusal = isApiError(error) && error.kind === 'validation' ? error.message : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Change my plan"
      description="Tell us what isn’t working. We’ll suggest a change for you to review first."
      dismissible={!replan.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={replan.isPending}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} loading={replan.isPending} disabled={presets.length === 0 && instruction.trim().length < 3}>
            {replan.isPending ? 'Finding a change…' : 'Suggest a change'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-2">
        <div className="grid gap-2" role="group" aria-label="Quick changes">
          <p className="font-medium">Quick changes</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <ToggleChip
                key={preset.value}
                selected={presets.includes(preset.value)}
                onToggle={() => setPresets((current) => (current.includes(preset.value) ? current.filter((p) => p !== preset.value) : [...current, preset.value]))}
              >
                {preset.label}
              </ToggleChip>
            ))}
          </div>
        </div>
        <Field label="Or describe it" optional>
          {(control) => (
            <TextArea {...control} maxLength={500} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. My parents are tired — make Day 2 lighter" />
          )}
        </Field>
        <Field label="Which part of the trip?">
          {(control) => (
            <Select {...control} value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">Whole trip</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {refusal ? (
          <InlineNotice tone="warning" title="No change suggested">
            {refusal}
          </InlineNotice>
        ) : error ? (
          <ErrorState error={error} context="replan" compact politeness="assertive" onRetry={submit} />
        ) : null}
      </div>
    </Dialog>
  );
}
