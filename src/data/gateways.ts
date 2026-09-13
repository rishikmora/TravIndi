import type { GatewayCity } from './types';

/** Cities trips commonly start from that are not themselves listed destinations. */
export const gatewayCities: GatewayCity[] = [
  { slug: 'bengaluru', name: 'Bengaluru', state: 'karnataka', coordinates: { lat: 12.9716, lng: 77.5946 } },
  { slug: 'chennai', name: 'Chennai', state: 'tamil-nadu', coordinates: { lat: 13.0827, lng: 80.2707 } },
  { slug: 'guwahati', name: 'Guwahati', state: 'assam', coordinates: { lat: 26.1445, lng: 91.7362 } },
  { slug: 'ahmedabad', name: 'Ahmedabad', state: 'gujarat', coordinates: { lat: 23.0225, lng: 72.5714 } },
  { slug: 'bhubaneswar', name: 'Bhubaneswar', state: 'odisha', coordinates: { lat: 20.2961, lng: 85.8245 } },
];

export function getGateway(slug: string) {
  return gatewayCities.find((g) => g.slug === slug);
}
