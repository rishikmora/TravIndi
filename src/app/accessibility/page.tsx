import type { Metadata } from 'next';
import { DisplayPreferences } from '@/components/account/DisplayPreferences';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'How TravIndi supports travellers who use screen readers, keyboards, larger text, reduced motion and more.',
  alternates: { canonical: '/accessibility' },
};

const SUPPORT = [
  { title: 'Keyboard', body: 'Every action can be reached with a keyboard. A “Skip to content” link appears first on every page, and focus is always visible.' },
  { title: 'Screen readers', body: 'Pages use headings, landmarks and labelled controls. Trip updates, SOS progress and new messages are announced as they happen.' },
  { title: 'Motion', body: 'With reduced motion, the 3D journey is replaced by still scenes and animations are minimised. We follow your device setting by default.' },
  { title: 'Text and contrast', body: 'Larger text, senior mode and high contrast can be switched on below. Status is always written in words, never shown by colour alone.' },
  { title: 'Maps', body: 'Map information is also available as text: routes list their trade-offs, and places and help points are listed with distances.' },
  { title: 'Plans that fit', body: 'Tell us about walking limits, wheelchair use or step-free needs, and itineraries are built around them. Unconfirmed access details are labelled as unconfirmed.' },
];

export default function AccessibilityPage() {
  return (
    <PageShell width="default">
      <PageHeader eyebrow="Accessibility" title="Travel that works for everyone" description="Our aim is to meet WCAG 2.2 AA across TravIndi. If something gets in your way, please tell us." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section title="What’s supported" level={2}>
          <ul className="grid gap-3">
            {SUPPORT.map((item) => (
              <li key={item.title} className="surface-card grid gap-1 p-5">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-[var(--text-muted)]">{item.body}</p>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Adjust this device" level={2}>
          <div className="surface-card p-5">
            <DisplayPreferences />
          </div>
          <p className="text-[0.9375rem] text-[var(--text-muted)]">
            Known limitations: the 3D journey needs a device with WebGL for its animated version; everyone else sees still scenes with the same content.
          </p>
        </Section>
      </div>
    </PageShell>
  );
}
