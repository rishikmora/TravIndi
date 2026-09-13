'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { ArrowRightIcon } from '@/components/ui/icons';

/** The home page's natural-language entry: hands the text to the planner, which shows what it understood first. */
export function HeroTripComposer() {
  const router = useRouter();
  const [text, setText] = useState('');
  const id = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim().slice(0, 1000);
    router.push(value.length >= 3 ? `/trips/plan?q=${encodeURIComponent(value)}` : '/trips/new');
  };

  return (
    <form onSubmit={submit} className="grid w-full max-w-2xl gap-2" aria-label="Plan a journey">
      <label htmlFor={id} className="sr-only">
        Tell us about your trip.
      </label>
      <div className="flex flex-col gap-2 rounded-[1.75rem] bg-white/[0.1] p-1.5 ring-1 ring-inset ring-white/25 backdrop-blur-md sm:flex-row sm:rounded-full">
        <input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          placeholder="Tell us about your trip — e.g. 4 days in Hyderabad with my parents"
          className="h-12 min-w-0 flex-1 rounded-full bg-transparent px-5 text-left text-[1rem] text-paper placeholder:text-paper/65 focus-visible:outline-none"
        />
        <button type="submit" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-paper px-6 font-semibold text-ink transition-colors hover:bg-white">
          Plan my journey
          <ArrowRightIcon size={18} />
        </button>
      </div>
      <p className="text-[0.8125rem] text-paper/70 scene-scrim">You’ll review what we understood before anything is planned.</p>
    </form>
  );
}
