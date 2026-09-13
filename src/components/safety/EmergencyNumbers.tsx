import { PhoneIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

const NUMBERS = [
  { label: 'Ambulance', number: '108' },
  { label: 'Tourist helpline', number: '1363' },
];

/**
 * Always available, signed in or not, online or offline. TravIndi does not
 * contact emergency services on anyone's behalf, so this is stated plainly.
 */
export function EmergencyNumbers({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <section aria-labelledby="emergency-numbers-title" className={cn('grid gap-3 rounded-3xl bg-[var(--tone-danger-bg)] p-4 md:p-5', className)}>
      <h2 id="emergency-numbers-title" className={cn('font-semibold', compact ? 'text-[1rem]' : 'text-[1.125rem]')}>
        In immediate danger? Call 112.
      </h2>
      <div className="flex flex-wrap gap-2">
        <a
          href="tel:112"
          className="tap-target inline-flex items-center gap-2 rounded-full bg-danger px-5 text-[1.0625rem] font-bold text-white shadow-[0_12px_28px_-16px_rgb(179_38_30/0.9)] hover:bg-[#961f18]"
        >
          <PhoneIcon size={18} />
          Call 112
        </a>
        {NUMBERS.map((entry) => (
          <a
            key={entry.number}
            href={`tel:${entry.number}`}
            className="tap-target inline-flex items-center gap-2 rounded-full bg-[var(--surface-raised)] px-4 font-semibold ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]"
          >
            {entry.label} <span className="tabular-nums">{entry.number}</span>
          </a>
        ))}
      </div>
      {!compact && (
        <p className="text-[0.875rem] text-[var(--text-muted)]">
          TravIndi isn’t connected to emergency services. Calls go straight from your phone.
        </p>
      )}
    </section>
  );
}
