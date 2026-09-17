'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
import { isApiError } from '@/lib/api/errors';
import { useReplan } from '@/lib/query/hooks/trips';
import type { AdaptationProposal, ReplanPreset } from '@/types/domain';

const PRESETS: ReplanPreset[] = ['more_relaxed', 'less_walking', 'avoid_crowds', 'cheaper', 'more_heritage', 'more_food', 'improve_safety'];

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
  const { t } = useTranslation();
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
      title={t('adaptation.replan.title')}
      description={t('adaptation.replan.description')}
      dismissible={!replan.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={replan.isPending}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="accent" onClick={submit} loading={replan.isPending} disabled={presets.length === 0 && instruction.trim().length < 3}>
            {replan.isPending ? t('adaptation.replan.finding') : t('adaptation.replan.suggest')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-2">
        <div className="grid gap-2" role="group" aria-label={t('adaptation.replan.quickChanges')}>
          <p className="font-medium">{t('adaptation.replan.quickChanges')}</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <ToggleChip
                key={preset}
                selected={presets.includes(preset)}
                onToggle={() => setPresets((current) => (current.includes(preset) ? current.filter((p) => p !== preset) : [...current, preset]))}
              >
                {t(`adaptation.replan.presets.${preset}`)}
              </ToggleChip>
            ))}
          </div>
        </div>
        <Field label={t('adaptation.replan.describe')} optional>
          {(control) => (
            <TextArea {...control} maxLength={500} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={t('adaptation.replan.placeholder')} />
          )}
        </Field>
        <Field label={t('adaptation.replan.whichPart')}>
          {(control) => (
            <Select {...control} value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">{t('adaptation.replan.wholeTrip')}</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {t('itinerary.view.day', { day: d })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {refusal ? (
          <InlineNotice tone="warning" title={t('adaptation.replan.noChange')}>
            {refusal}
          </InlineNotice>
        ) : error ? (
          <ErrorState error={error} context="replan" compact politeness="assertive" onRetry={submit} />
        ) : null}
      </div>
    </Dialog>
  );
}
