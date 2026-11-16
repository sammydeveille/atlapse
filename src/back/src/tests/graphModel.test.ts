import { describe, it, expect } from 'vitest';
import { formatYear, isValidYear, yearDistance, yearFromIsoDate } from '../utils/yearTime.js';
import { CORRELATION_WEIGHTS, epicentre, haversineKm, linkStrength } from '../utils/correlation.js';
import { DEFAULT_KINDS, DEFAULT_PREDICATES, PREDICATE_FAMILIES } from '../registry/defaults.js';
import { createNodeSchema, createStatementSchema, nodeTimeInputSchema, yearSchema } from '../types/graph.js';

const USER = '550e8400-e29b-41d4-a716-446655440000';
const A = '550e8400-e29b-41d4-a716-446655440001';
const B = '550e8400-e29b-41d4-a716-446655440002';

describe('year time', () => {
  it('has no year 0', () => {
    expect(isValidYear(0)).toBe(false);
    expect(isValidYear(-40000)).toBe(true);
    expect(yearSchema.safeParse(0).success).toBe(false);
    expect(yearSchema.safeParse(-40000).success).toBe(true);
  });

  it('steps over the missing year 0', () => {
    expect(yearDistance(-1, 1)).toBe(1);
    expect(yearDistance(1907, 1937)).toBe(30);
    expect(yearDistance(-500, 500)).toBe(999);
  });

  it('formats deep time, early and modern years', () => {
    expect(formatYear(-40000)).toBe('40,000 BCE');
    expect(formatYear(476)).toBe('476 CE');
    expect(formatYear(1937)).toBe('1937');
    expect(() => formatYear(0)).toThrow();
  });

  it('reads the year of an ISO date', () => {
    expect(yearFromIsoDate('1937-04-26')).toBe(1937);
    expect(() => yearFromIsoDate('April 1937')).toThrow();
  });

  it('rejects a span that ends before it starts', () => {
    expect(nodeTimeInputSchema.safeParse({ startYear: 1939, endYear: 1936 }).success).toBe(false);
    expect(nodeTimeInputSchema.safeParse({ startYear: -3000, endYear: -2500, precision: 'century' }).success).toBe(true);
  });
});

describe('correlation', () => {
  it('weights sum to 1', () => {
    const sum = Object.values(CORRELATION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('gives full strength to identical signals and none to unrelated ones', () => {
    const same = { year: 1937, point: { lon: 2.35, lat: 48.85 }, people: ['p'], tags: ['war'] };
    expect(linkStrength(same, same).strength).toBe(1);
    const far = linkStrength(
      { year: 1500, point: { lon: 139.7, lat: 35.7 }, people: ['x'], tags: ['a'] },
      { year: 1937, point: { lon: 2.35, lat: 48.85 }, people: ['y'], tags: ['b'] },
    );
    expect(far.strength).toBe(0);
    expect(far.why).toEqual([]);
  });

  it('explains itself and stays between 0 and 1 with partial data', () => {
    const result = linkStrength({ year: 1937, tags: ['war', 'spain'] }, { year: 1944, tags: ['war'] });
    expect(result.strength).toBeGreaterThan(0);
    expect(result.strength).toBeLessThan(1);
    expect(result.why).toContain('7 years apart');
    expect(result.why).toContain('shared tags');
  });

  it('measures distance and finds a centre', () => {
    expect(haversineKm({ lon: 2.3522, lat: 48.8566 }, { lon: -3.7038, lat: 40.4168 })).toBeGreaterThan(1000);
    expect(haversineKm({ lon: 2.3522, lat: 48.8566 }, { lon: -3.7038, lat: 40.4168 })).toBeLessThan(1100);
    expect(epicentre([])).toBeNull();
    const centre = epicentre([{ lon: 170, lat: 0 }, { lon: -170, lat: 0 }]);
    // Across the date line the centre is at 180, not at 0.
    expect(Math.abs(centre!.lon)).toBeCloseTo(180);
  });
});

describe('registry defaults', () => {
  it('has unique keys and valid parents with matching classes', () => {
    const byKey = new Map(DEFAULT_KINDS.map((k) => [k.key, k]));
    expect(byKey.size).toBe(DEFAULT_KINDS.length);
    for (const k of DEFAULT_KINDS) {
      if (!k.parentKey) continue;
      expect(byKey.get(k.parentKey), `parent of ${k.key}`).toBeDefined();
      expect(byKey.get(k.parentKey)!.class).toBe(k.class);
    }
  });

  it('covers every predicate family and never lets a causal predicate be unattributed', () => {
    const families = new Set(DEFAULT_PREDICATES.map((p) => p.family));
    for (const family of PREDICATE_FAMILIES) expect(families.has(family), family).toBe(true);
    for (const p of DEFAULT_PREDICATES.filter((row) => row.family === 'claim')) {
      expect(p.attributed, p.key).toBe(true);
    }
    for (const p of DEFAULT_PREDICATES.filter((row) => row.family === 'correlation')) {
      expect(p.computed, p.key).toBe(true);
      expect(p.label).not.toMatch(/caus|led to|because/i);
    }
  });
});

describe('graph input validation', () => {
  it('normalises tags and applies defaults', () => {
    const parsed = createNodeSchema.parse({ userId: USER, kindKey: 'painting', title: ' Guernica ', tags: [' War ', 'SPAIN'] });
    expect(parsed.title).toBe('Guernica');
    expect(parsed.tags).toEqual(['war', 'spain']);
    expect(parsed.times).toEqual([]);
  });

  it('needs exactly one object on a statement', () => {
    const base = { userId: USER, subjectId: A, predicateKey: 'depicts' };
    expect(createStatementSchema.safeParse(base).success).toBe(false);
    expect(createStatementSchema.safeParse({ ...base, objectId: B }).success).toBe(true);
    expect(createStatementSchema.safeParse({ ...base, objectId: B, objectStatementId: A }).success).toBe(false);
  });
});
