import { yearDistance } from './yearTime.js';

/**
 * Link strength between two nodes, from signals the system can compute.
 * It measures how much two things share, never whether one caused the other.
 *
 * The weights are a starting point, equal on purpose, until real data shows
 * which signals matter. Change them here only.
 */
export const CORRELATION_WEIGHTS = {
  time: 0.25,
  place: 0.25,
  people: 0.25,
  tags: 0.25,
} as const;

/** Two things this many years apart or more get no time signal. */
export const TIME_WINDOW_YEARS = 50;
/** Two places this far apart or more get no place signal. */
export const PLACE_WINDOW_KM = 2000;

export interface CorrelationInput {
  year?: number;
  point?: { lon: number; lat: number };
  /** Ids of person and group nodes linked to the node. */
  people?: string[];
  tags?: string[];
}

export interface CorrelationResult {
  strength: number;
  signals: { time: number; place: number; people: number; tags: number };
  /** Plain-language reasons, for the "why" line in the interface. */
  why: string[];
}

export function haversineKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function jaccard(a: string[] = [], b: string[] = []): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const item of setA) if (setB.has(item)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

export function linkStrength(a: CorrelationInput, b: CorrelationInput): CorrelationResult {
  const why: string[] = [];

  let time = 0;
  if (a.year !== undefined && b.year !== undefined) {
    const gap = yearDistance(a.year, b.year);
    time = Math.max(0, 1 - gap / TIME_WINDOW_YEARS);
    if (time > 0) why.push(gap === 0 ? 'same year' : gap === 1 ? '1 year apart' : `${gap} years apart`);
  }

  let place = 0;
  if (a.point && b.point) {
    const km = haversineKm(a.point, b.point);
    place = Math.max(0, 1 - km / PLACE_WINDOW_KM);
    if (place > 0) why.push(km < 1 ? 'same place' : `${Math.round(km)} km apart`);
  }

  const people = jaccard(a.people, b.people);
  if (people > 0) why.push('shared people');

  const tags = jaccard(a.tags, b.tags);
  if (tags > 0) why.push('shared tags');

  const w = CORRELATION_WEIGHTS;
  const strength = time * w.time + place * w.place + people * w.people + tags * w.tags;
  return { strength: Number(strength.toFixed(4)), signals: { time, place, people, tags }, why };
}

/** Centre of a set of points on the globe, for framing the backdrop. */
export function epicentre(points: { lon: number; lat: number }[]): { lon: number; lat: number } | null {
  if (points.length === 0) return null;
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const lat = (p.lat * Math.PI) / 180;
    const lon = (p.lon * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  x /= points.length; y /= points.length; z /= points.length;
  const hyp = Math.sqrt(x * x + y * y);
  if (hyp < 1e-9 && Math.abs(z) < 1e-9) return null;
  return {
    lon: Number(((Math.atan2(y, x) * 180) / Math.PI).toFixed(5)),
    lat: Number(((Math.atan2(z, hyp) * 180) / Math.PI).toFixed(5)),
  };
}
