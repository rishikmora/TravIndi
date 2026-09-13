import type {
  AdaptationChangeDto,
  AdaptationProposalDto,
  ImpactSummaryDto,
  ItineraryDto,
  ItineraryItemDto,
  ItineraryItemRefDto,
  ReplanRequestDto,
  TripDto,
} from '@/types/api';
import { HYDERABAD_PLACES, type PlaceRecord, placesForDestination } from '../catalog/places';
import { clone, fail, minutesFromNow, newId } from '../http';
import { makeItem, summariseBudget, toMinutes, toTime, travelLeg, validate } from './itinerary';

/** Items a proposal adds or retimes, kept server-side until it is applied. */
export interface ProposalPayload {
  proposal_id: string;
  variants: Array<{
    alternative_id: string | null;
    remove: string[];
    add: Array<{ day_number: number; after_item_id: string | null; item: ItineraryItemDto }>;
    retime: Array<{ item_id: string; start_time: string; end_time: string }>;
  }>;
}

const ref = (item: ItineraryItemDto, override?: Partial<ItineraryItemRefDto>): ItineraryItemRefDto => ({
  item_id: item.item_id,
  title: item.title,
  place_name: item.place?.name ?? null,
  category: item.category,
  start_time: item.start_time,
  end_time: item.end_time,
  ...override,
});

function placeOf(item: ItineraryItemDto, slug: string): PlaceRecord | null {
  return placesForDestination(slug).find((p) => p.place_id === item.place?.place_id) ?? null;
}

/**
 * Demo scenario: visitor reports of heavy evening crowds at the next temple
 * stop. Proposes a nearby, lower-walking temple that matches the traveller's
 * interests, and retimes the stop that follows.
 */
export function buildCrowdProposal(trip: TripDto, itinerary: ItineraryDto): { proposal: AdaptationProposalDto; payload: ProposalPayload } | null {
  const slug = trip.destination?.slug ?? 'hyderabad';
  const used = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.place?.place_id)));

  for (const day of itinerary.days) {
    const index = day.items.findIndex((item) => {
      const place = placeOf(item, slug);
      return place && place.kind === 'attraction' && place.tags.includes('temples') && place.walking !== 'low';
    });
    if (index < 0) continue;

    const current = day.items[index]!;
    const currentPlace = placeOf(current, slug)!;
    const previousPlace = index > 0 ? placeOf(day.items[index - 1]!, slug) : null;
    const replacementPlace = placesForDestination(slug).find(
      (p) => p.kind === 'attraction' && p.tags.includes('temples') && p.walking === 'low' && !used.has(p.place_id),
    ) ?? (slug === 'hyderabad' ? HYDERABAD_PLACES.find((p) => p.place_id === 'plc_hyd_jagannath') : undefined);
    if (!replacementPlace) continue;

    const oldLeg = travelLeg(previousPlace, currentPlace);
    const newLeg = travelLeg(previousPlace, replacementPlace);
    const previousEnd = index > 0 ? toMinutes(day.items[index - 1]!.end_time ?? current.start_time ?? '16:00') : toMinutes(current.start_time ?? '16:00');
    const start = Math.max(toMinutes(current.start_time ?? '16:00'), previousEnd + (newLeg?.duration_minutes ?? 0));
    const added = makeItem(replacementPlace, start, trip, previousPlace);
    added.status = 'changed';

    const changes: AdaptationChangeDto[] = [
      {
        change_id: newId('chg'),
        change_type: 'removed',
        day_number: day.day_number,
        before: ref(current),
        after: null,
        reasons: [{ code: 'crowd_signal', label: 'Heavy crowds reported this evening' }],
      },
      {
        change_id: newId('chg'),
        change_type: 'added',
        day_number: day.day_number,
        before: null,
        after: ref(added),
        reasons: added.reasons,
      },
    ];

    const retime: ProposalPayload['variants'][number]['retime'] = [];
    const next = day.items[index + 1];
    const addedEnd = toMinutes(added.end_time!);
    if (next && next.start_time) {
      const nextLeg = travelLeg(replacementPlace, placeOf(next, slug));
      const earliest = addedEnd + (nextLeg?.duration_minutes ?? 10);
      if (earliest > toMinutes(next.start_time)) {
        const shift = earliest - toMinutes(next.start_time);
        const updated = { item_id: next.item_id, start_time: toTime(earliest), end_time: toTime(toMinutes(next.end_time ?? next.start_time) + shift) };
        retime.push(updated);
        changes.push({
          change_id: newId('chg'),
          change_type: 'moved',
          day_number: day.day_number,
          before: ref(next),
          after: ref(next, { start_time: updated.start_time, end_time: updated.end_time }),
          reasons: [{ code: 'retimed', label: 'Moved to fit the new stop' }],
        });
      }
    }
    for (const unchanged of day.items.slice(index + 1 + retime.length)) {
      changes.push({ change_id: newId('chg'), change_type: 'unchanged', day_number: day.day_number, before: ref(unchanged), after: ref(unchanged), reasons: [] });
    }

    const impact: ImpactSummaryDto = {
      time_delta_minutes: (newLeg?.duration_minutes ?? 0) - (oldLeg?.duration_minutes ?? 0) + (replacementPlace.duration_minutes - currentPlace.duration_minutes > 0 ? 0 : 0),
      distance_delta_meters: (newLeg?.distance_meters ?? 0) - (oldLeg?.distance_meters ?? 0),
      cost: { status: 'no_known_change', delta: null },
      safety: { status: 'unchanged', note: 'No known change in safety.' },
    };

    const alternativeId = newId('alt');
    const proposal: AdaptationProposalDto = {
      proposal_id: newId('adp'),
      trip_id: trip.trip_id,
      based_on_version: itinerary.version,
      trigger_type: 'crowd',
      reason_code: 'crowd_reported_at_next_stop',
      title: `${replacementPlace.name} instead of ${currentPlace.name}`,
      summary: `Something changed near your next stop. Visitors are reporting heavy crowds at ${currentPlace.name}.`,
      confidence: 'medium',
      risk_level: 'low',
      changes,
      impact_summary: impact,
      reasons: [
        { code: 'lower_crowd_signal', label: 'Lower current crowd signal' },
        ...added.reasons.filter((r) => r.code !== 'close_to_previous'),
      ].slice(0, 3),
      alternatives: [
        {
          alternative_id: alternativeId,
          title: `Skip ${currentPlace.name} and rest before the evening`,
          summary: 'Removes the temple stop and leaves unscheduled time instead.',
          reasons: [{ code: 'rest', label: 'Leaves room to rest' }],
          impact_summary: { time_delta_minutes: -(oldLeg?.duration_minutes ?? 0), distance_delta_meters: -(oldLeg?.distance_meters ?? 0), cost: { status: 'no_known_change', delta: null }, safety: { status: 'unchanged', note: null } },
        },
      ],
      event: {
        event_id: newId('evt'),
        trigger_type: 'crowd',
        observed_at: new Date(Date.now() - 2 * 60_000).toISOString(),
        summary: `Visitor reports indicate heavy crowds at ${currentPlace.name} this evening.`,
        source_kind: 'application',
        source_label: 'Visitor reports (sample data)',
        location_label: currentPlace.name,
      },
      status: 'proposed',
      created_at: new Date().toISOString(),
      expires_at: minutesFromNow(30),
      resulting_version: null,
      failure_reason: null,
    };

    const payload: ProposalPayload = {
      proposal_id: proposal.proposal_id,
      variants: [
        {
          alternative_id: null,
          remove: [current.item_id],
          add: [{ day_number: day.day_number, after_item_id: day.items[index - 1]?.item_id ?? null, item: added }],
          retime,
        },
        { alternative_id: alternativeId, remove: [current.item_id], add: [], retime: [] },
      ],
    };
    return { proposal, payload };
  }
  return null;
}

export function applyPayload(trip: TripDto, itinerary: ItineraryDto, payload: ProposalPayload, alternativeId: string | null): ItineraryDto {
  const variant = payload.variants.find((v) => v.alternative_id === (alternativeId ?? null));
  if (!variant) fail(422, 'unknown_alternative', 'That option is no longer available.');
  const next = clone(itinerary);
  next.version = itinerary.version + 1;
  next.created_at = new Date().toISOString();
  next.created_by = 'adaptation';

  for (const day of next.days) {
    day.items = day.items.filter((item) => !variant.remove.includes(item.item_id));
    for (const addition of variant.add.filter((a) => a.day_number === day.day_number)) {
      const at = addition.after_item_id ? day.items.findIndex((i) => i.item_id === addition.after_item_id) + 1 : 0;
      day.items.splice(Math.max(0, at), 0, clone(addition.item));
    }
    for (const retime of variant.retime) {
      const item = day.items.find((i) => i.item_id === retime.item_id);
      if (item) {
        item.start_time = retime.start_time;
        item.end_time = retime.end_time;
        item.status = 'changed';
      }
    }
    day.items.sort((a, b) => toMinutes(a.start_time ?? '00:00') - toMinutes(b.start_time ?? '00:00'));
  }
  next.budget = summariseBudget(next.days, trip);
  next.validation = validate(next.days, trip);
  return next;
}

/**
 * Manual replan requests. Where the available data cannot support a request
 * (e.g. "cheaper" without known prices) the backend says so instead of
 * inventing changes.
 */
export function buildReplanProposal(
  trip: TripDto,
  itinerary: ItineraryDto,
  request: ReplanRequestDto,
): { proposal: AdaptationProposalDto; payload: ProposalPayload } {
  const slug = trip.destination?.slug ?? 'hyderabad';
  const instruction = (request.instruction ?? '').toLowerCase();
  const presets = new Set(request.presets);
  if (/tir(?:ing|ed)|relax|rest|slow|easier|lighter/.test(instruction)) presets.add('more_relaxed');
  if (/walk/.test(instruction)) presets.add('less_walking');
  if (/crowd/.test(instruction)) presets.add('avoid_crowds');
  if (/cheap|budget|cost/.test(instruction)) presets.add('cheaper');
  const dayMatch = instruction.match(/day\s*(\d+)/);
  const scopeDay = request.scope.day_number ?? (dayMatch ? Number(dayMatch[1]) : null);

  if (presets.size === 0) {
    fail(422, 'instruction_not_understood', 'We couldn’t work out what to change. Try one of the suggestions, or describe the change differently.');
  }
  if (presets.has('cheaper') && presets.size === 1) {
    fail(422, 'insufficient_price_data', 'We can’t make this cheaper yet — most costs in this plan aren’t known, so savings can’t be shown honestly.');
  }

  const days = itinerary.days.filter((d) => (scopeDay ? d.day_number === scopeDay : true));
  const changes: AdaptationChangeDto[] = [];
  const variant: ProposalPayload['variants'][number] = { alternative_id: null, remove: [], add: [], retime: [] };
  const used = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.place?.place_id)));
  let title = 'Adjusted plan';

  if (presets.has('less_walking')) {
    for (const day of days) {
      day.items.forEach((item, index) => {
        const place = placeOf(item, slug);
        if (!place || place.kind !== 'attraction' || place.walking === 'low') return;
        const alternative = placesForDestination(slug).find(
          (p) => p.kind === 'attraction' && p.walking === 'low' && !used.has(p.place_id) && p.tags.some((t) => place.tags.includes(t)),
        );
        if (!alternative) return;
        used.add(alternative.place_id);
        const added = makeItem(alternative, toMinutes(item.start_time ?? '10:00'), trip, index > 0 ? placeOf(day.items[index - 1]!, slug) : null);
        added.status = 'changed';
        variant.remove.push(item.item_id);
        variant.add.push({ day_number: day.day_number, after_item_id: day.items[index - 1]?.item_id ?? null, item: added });
        changes.push(
          { change_id: newId('chg'), change_type: 'removed', day_number: day.day_number, before: ref(item), after: null, reasons: [{ code: 'walking', label: 'Involves more walking' }] },
          { change_id: newId('chg'), change_type: 'added', day_number: day.day_number, before: null, after: ref(added), reasons: added.reasons },
        );
      });
    }
    title = 'Less walking';
  }

  if (presets.has('more_relaxed')) {
    const target = scopeDay
      ? itinerary.days.find((d) => d.day_number === scopeDay)
      : [...itinerary.days].sort((a, b) => b.items.length - a.items.length)[0];
    const candidate = target
      ? [...target.items].reverse().find((i) => (i.kind === 'attraction' || i.kind === 'experience') && !variant.remove.includes(i.item_id))
      : undefined;
    if (target && candidate) {
      const rest = {
        item_id: newId('itm'),
        kind: 'free_time' as const,
        title: 'Rest at your stay',
        description: 'Unscheduled time to recharge.',
        place: null,
        category: 'Free time',
        start_time: candidate.start_time,
        end_time: candidate.end_time,
        duration_minutes: candidate.duration_minutes,
        travel_from_previous: null,
        reasons: [{ code: 'rest', label: 'Makes the day less tiring' }],
        status: 'changed' as const,
        cost: { status: 'unavailable' as const, value: null },
        safety_note: null,
        accessibility: null,
        booking: null,
      };
      variant.remove.push(candidate.item_id);
      variant.add.push({ day_number: target.day_number, after_item_id: null, item: rest });
      changes.push(
        { change_id: newId('chg'), change_type: 'removed', day_number: target.day_number, before: ref(candidate), after: null, reasons: [{ code: 'lighter_day', label: 'Lightens a busy day' }] },
        { change_id: newId('chg'), change_type: 'added', day_number: target.day_number, before: null, after: ref(rest), reasons: rest.reasons },
      );
      title = scopeDay ? `A lighter Day ${scopeDay}` : 'A more relaxed pace';
    }
  }

  if (presets.has('avoid_crowds')) {
    for (const day of days) {
      for (const item of day.items) {
        const place = placeOf(item, slug);
        if (place?.tags.includes('crowded') && !variant.remove.includes(item.item_id)) {
          variant.remove.push(item.item_id);
          changes.push({ change_id: newId('chg'), change_type: 'removed', day_number: day.day_number, before: ref(item), after: null, reasons: [{ code: 'crowds', label: 'Often crowded' }] });
          title = 'Fewer crowded stops';
        }
      }
    }
  }

  if (changes.length === 0) {
    fail(422, 'no_suitable_changes', 'Your plan already fits this request as far as our data can tell. No changes were made.');
  }

  const proposal: AdaptationProposalDto = {
    proposal_id: newId('adp'),
    trip_id: trip.trip_id,
    based_on_version: itinerary.version,
    trigger_type: 'user_request',
    reason_code: `replan_${[...presets].join('_')}`,
    title,
    summary: 'Here’s a version of your plan with the change you asked for.',
    confidence: 'high',
    risk_level: 'low',
    changes,
    impact_summary: { time_delta_minutes: null, distance_delta_meters: null, cost: { status: 'unknown', delta: null }, safety: { status: 'unchanged', note: null } },
    reasons: [{ code: 'requested', label: 'Based on your request' }],
    alternatives: [],
    event: null,
    status: 'proposed',
    created_at: new Date().toISOString(),
    expires_at: minutesFromNow(60),
    resulting_version: null,
    failure_reason: null,
  };
  return { proposal, payload: { proposal_id: proposal.proposal_id, variants: [variant] } };
}
