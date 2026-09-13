'use client';

import { QUALITY_ORDER } from '@/3d/core/quality';
import { Switch } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { type MotionPreference, type QualityPreference, usePreferences } from '@/store/preferences';

const capitalise = (value: string) => value[0]!.toUpperCase() + value.slice(1);

/** Device-level display preferences. Stored on this device only. */
export function DisplayPreferences({ showQuality = true }: { showQuality?: boolean }) {
  const preferences = usePreferences();

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="font-medium">Text size</p>
        <SegmentedControl
          label="Text size"
          value={preferences.textSize}
          onChange={preferences.setTextSize}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'large', label: 'Large' },
          ]}
        />
      </div>

      <Switch
        label="Senior mode"
        description="Larger text and buttons, calmer motion and simpler screens."
        checked={preferences.seniorMode}
        onChange={(e) => preferences.setSeniorMode(e.target.checked)}
      />

      <Switch
        label="High contrast"
        description="Stronger text and borders for easier reading in bright light."
        checked={preferences.highContrast}
        onChange={(e) => preferences.setHighContrast(e.target.checked)}
      />

      <div className="grid gap-2">
        <p className="font-medium">Motion</p>
        <SegmentedControl<MotionPreference>
          label="Motion"
          value={preferences.motion}
          onChange={preferences.setMotion}
          options={[
            { value: 'system', label: 'Match device' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'full', label: 'Full' },
          ]}
        />
        <p className="text-[0.8125rem] text-[var(--text-muted)]">Reduced motion replaces the animated 3D journey with still scenes.</p>
      </div>

      {showQuality && (
        <div className="grid gap-2">
          <p className="font-medium">3D quality</p>
          <SegmentedControl<QualityPreference>
            label="3D quality"
            size="sm"
            value={preferences.quality}
            onChange={preferences.setQuality}
            options={[{ value: 'auto', label: 'Automatic' }, ...QUALITY_ORDER.map((level) => ({ value: level, label: capitalise(level) }))]}
          />
          <p className="text-[0.8125rem] text-[var(--text-muted)]">Lower quality saves battery and data on slower devices.</p>
        </div>
      )}
    </div>
  );
}
