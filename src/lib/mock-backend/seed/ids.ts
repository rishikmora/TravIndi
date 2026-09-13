/** Stable identifiers for the development dataset. */

export const U = {
  ananya: 'usr_ananya',
  rahul: 'usr_rahul',
  appa: 'usr_srinivas',
  amma: 'usr_meera',
  priya: 'usr_priya',
  ops: 'usr_ops_desk',
  farhan: 'usr_farhan',
  oldcity: 'usr_oldcity',
} as const;

export const T = {
  hyderabad: 'trp_hyderabad_family',
  jaipur: 'trp_jaipur_draft',
  kerala: 'trp_kerala_backwaters',
} as const;

export const C = {
  tripHyd: 'cnv_trip_hyderabad',
  tripJaipur: 'cnv_trip_jaipur',
  tripKerala: 'cnv_trip_kerala',
  dmFarhan: 'cnv_dm_farhan',
  dmPriya: 'cnv_dm_priya',
  communityHyd: 'cnv_community_hyderabad',
} as const;

/** Development-only credential for the seeded demo accounts. Never used in API mode. */
export const DEMO_PASSWORD = 'travindi-demo';

export const DEMO_ACCOUNTS = [
  { email: 'demo@travindi.dev', label: 'Traveller — Ananya' },
  { email: 'priya@travindi.dev', label: 'Trip member — Priya' },
  { email: 'operations@travindi.dev', label: 'Authority — Operations desk' },
  { email: 'farhan@travindi.dev', label: 'Guide partner — Farhan' },
  { email: 'oldcity@travindi.dev', label: 'Business partner — Old City Walks' },
] as const;

export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
export const minutesAhead = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/** Today's (or an offset day's) local wall-clock time as an ISO timestamp. */
export function atLocal(hours: number, minutes = 0, dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}
