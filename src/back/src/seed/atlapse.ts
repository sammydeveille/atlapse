import { v5 as uuidv5 } from 'uuid';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { kind, node, nodeGeo, nodeTime, predicate, statement, statementEvidence } from '../db/schema.js';
import { DEFAULT_KINDS, DEFAULT_PREDICATES } from '../registry/defaults.js';
import { linkStrength } from '../utils/correlation.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NodePgDatabase<any>;

const NAMESPACE = '6f1d3c1e-8a55-4f0b-9c58-a71a95e00001';
/** Stable ids, so the seed can run again without making duplicates. */
export const seedId = (slug: string) => uuidv5(slug, NAMESPACE);

export async function seedRegistry(db: Db) {
  // Parents first, so sub-kinds can point at them.
  const ordered = [...DEFAULT_KINDS].sort((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)));
  for (const row of ordered) {
    await db.insert(kind).values(row).onConflictDoUpdate({
      target: kind.key,
      set: { label: row.label, color: row.color ?? null, renderer: row.renderer ?? null },
    });
  }
  for (const row of DEFAULT_PREDICATES) {
    await db.insert(predicate).values(row).onConflictDoUpdate({
      target: predicate.key,
      set: {
        family: row.family, label: row.label, inverseLabel: row.inverseLabel,
        computed: row.computed ?? false, attributed: row.attributed ?? false,
      },
    });
  }
  return { kinds: DEFAULT_KINDS.length, predicates: DEFAULT_PREDICATES.length };
}

interface SeedNode {
  slug: string;
  kind: string;
  title: string;
  summary: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
  time?: { startYear: number; endYear?: number; precision?: string; startDate?: string };
  geo?: { lon: number; lat: number; precision?: string };
}

interface SeedStatement {
  s: string;
  p: string;
  o: string;
  qualifiers?: Record<string, unknown>;
  status?: 'accepted' | 'computed';
  confidence?: number;
  evidence?: { source: string; relevance?: string; excerpt?: string }[];
}

const NODES: SeedNode[] = [
  { slug: 'guernica', kind: 'painting', title: 'Guernica',
    summary: 'Large oil painting by Pablo Picasso, made in Paris in 1937 for the Spanish Republic pavilion at the Paris International Exposition.',
    tags: ['painting', 'oil', 'monochrome', 'war', 'spain', 'mural'],
    attributes: { medium: 'Oil on canvas' }, time: { startYear: 1937 } },
  { slug: 'picasso', kind: 'individual', title: 'Pablo Picasso',
    summary: 'Spanish painter and sculptor who spent most of his working life in France.',
    tags: ['painter', 'sculptor', 'spain'], time: { startYear: 1881, endYear: 1973 } },
  { slug: 'goya', kind: 'individual', title: 'Francisco Goya',
    summary: 'Spanish painter and printmaker.',
    tags: ['painter', 'printmaker', 'spain'], time: { startYear: 1746, endYear: 1828 } },
  { slug: 'bombing-of-guernica', kind: 'historical_event', title: 'Bombing of Guernica',
    summary: 'Air raid on the Basque town of Gernika on 26 April 1937, during the Spanish Civil War.',
    tags: ['war', 'spain', 'basque', 'air raid'],
    time: { startYear: 1937, precision: 'day', startDate: '1937-04-26' } },
  { slug: 'spanish-civil-war', kind: 'historical_event', title: 'Spanish Civil War',
    summary: 'War fought in Spain from 1936 to 1939.',
    tags: ['war', 'spain'], time: { startYear: 1936, endYear: 1939 } },
  { slug: 'paris-expo-1937', kind: 'exhibition', title: 'Paris International Exposition of 1937',
    summary: 'World fair held in Paris in 1937. Guernica was first shown in its Spanish pavilion.',
    tags: ['world fair', 'paris'], time: { startYear: 1937 }, geo: { lon: 2.2885, lat: 48.8617 } },
  { slug: 'third-of-may-1808', kind: 'painting', title: 'The Third of May 1808',
    summary: 'Painting by Francisco Goya, completed in 1814, of an execution of Spanish civilians by French soldiers.',
    tags: ['painting', 'oil', 'war', 'spain'], attributes: { medium: 'Oil on canvas' }, time: { startYear: 1814 } },
  { slug: 'demoiselles-d-avignon', kind: 'painting', title: "Les Demoiselles d'Avignon",
    summary: 'Painting by Pablo Picasso from 1907, often named as a starting point of Cubism.',
    tags: ['painting', 'oil'], attributes: { medium: 'Oil on canvas' }, time: { startYear: 1907 } },
  { slug: 'charnel-house', kind: 'painting', title: 'The Charnel House',
    summary: 'Painting by Pablo Picasso, made in 1944 and 1945, in black, white and grey.',
    tags: ['painting', 'monochrome', 'war'], time: { startYear: 1944, endYear: 1945 } },
  { slug: 'cubism', kind: 'current', title: 'Cubism',
    summary: 'Early twentieth-century art movement that shows subjects from several viewpoints at once.',
    tags: ['movement', 'modern art'], time: { startYear: 1907, endYear: 1920, precision: 'decade' } },
  { slug: 'surrealism', kind: 'current', title: 'Surrealism',
    summary: 'Movement in art and literature that began in Paris in the 1920s.',
    tags: ['movement', 'modern art', 'paris'], time: { startYear: 1924, endYear: 1950, precision: 'decade' } },
  { slug: 'anti-war', kind: 'idea', title: 'Anti-war sentiment',
    summary: 'Opposition to war, expressed across art forms and periods.', tags: ['war', 'protest'] },
  { slug: 'paris', kind: 'city', title: 'Paris', summary: 'Capital of France.', tags: ['france'],
    geo: { lon: 2.3522, lat: 48.8566, precision: 'region' } },
  { slug: 'gernika', kind: 'city', title: 'Gernika', summary: 'Town in the Basque Country, Spain.', tags: ['spain', 'basque'],
    geo: { lon: -2.678, lat: 43.317, precision: 'region' } },
  { slug: 'madrid', kind: 'city', title: 'Madrid', summary: 'Capital of Spain.', tags: ['spain'],
    geo: { lon: -3.7038, lat: 40.4168, precision: 'region' } },
  { slug: 'reina-sofia', kind: 'venue', title: 'Museo Reina Sofía',
    summary: 'National museum of modern art in Madrid, where Guernica has hung since 1992.',
    tags: ['museum', 'spain'], geo: { lon: -3.6943, lat: 40.4086, precision: 'exact' } },
  { slug: 'prado', kind: 'venue', title: 'Museo del Prado',
    summary: 'National art museum in Madrid.', tags: ['museum', 'spain'],
    geo: { lon: -3.6921, lat: 40.4138, precision: 'exact' } },
  // Sources
  { slug: 'src-times-steer-1937', kind: 'news_article', title: 'The Tragedy of Guernica',
    summary: 'Report by George Steer in The Times, 28 April 1937, on the bombing.',
    tags: ['newspaper'], attributes: { publisher: 'The Times', author: 'George Steer', reliability: 'primary' },
    time: { startYear: 1937, precision: 'day', startDate: '1937-04-28' } },
  { slug: 'src-wikipedia-guernica', kind: 'encyclopedia_article', title: 'Guernica (Picasso), Wikipedia',
    summary: 'Wikipedia article on the painting.',
    attributes: { url: 'https://en.wikipedia.org/wiki/Guernica_(Picasso)', publisher: 'Wikipedia', reliability: 'tertiary' } },
  { slug: 'src-reina-sofia-site', kind: 'web_link', title: 'Museo Reina Sofía website',
    summary: 'Website of the museum that holds the painting.',
    attributes: { url: 'https://www.museoreinasofia.es', publisher: 'Museo Reina Sofía', reliability: 'institution' } },
];

const WIKI = 'src-wikipedia-guernica';
const MUSEUM = 'src-reina-sofia-site';

const STATEMENTS: SeedStatement[] = [
  { s: 'guernica', p: 'created_by', o: 'picasso', qualifiers: { role: 'painter' }, evidence: [{ source: WIKI }, { source: MUSEUM }] },
  { s: 'guernica', p: 'located_at', o: 'paris', qualifiers: { role: 'made', year: 1937 }, evidence: [{ source: WIKI }] },
  { s: 'guernica', p: 'located_at', o: 'reina-sofia', qualifiers: { role: 'held', fromYear: 1992 }, evidence: [{ source: MUSEUM, relevance: 'primary' }] },
  { s: 'guernica', p: 'presented_at', o: 'paris-expo-1937', qualifiers: { role: 'first shown' }, evidence: [{ source: WIKI }] },
  { s: 'guernica', p: 'depicts', o: 'bombing-of-guernica', evidence: [{ source: WIKI }, { source: MUSEUM }] },
  { s: 'guernica', p: 'instance_of', o: 'cubism', confidence: 0.8, evidence: [{ source: WIKI }] },
  { s: 'guernica', p: 'instance_of', o: 'surrealism', confidence: 0.6, evidence: [{ source: WIKI }] },
  { s: 'guernica', p: 'expresses', o: 'anti-war', evidence: [{ source: WIKI }] },
  { s: 'reina-sofia', p: 'located_at', o: 'madrid' },
  { s: 'prado', p: 'located_at', o: 'madrid' },
  { s: 'bombing-of-guernica', p: 'located_at', o: 'gernika', evidence: [{ source: 'src-times-steer-1937', relevance: 'primary' }] },
  { s: 'src-times-steer-1937', p: 'documents', o: 'bombing-of-guernica' },
  { s: 'picasso', p: 'located_at', o: 'paris', qualifiers: { role: 'lived' } },
  { s: 'third-of-may-1808', p: 'created_by', o: 'goya', qualifiers: { role: 'painter' } },
  { s: 'third-of-may-1808', p: 'located_at', o: 'prado', qualifiers: { role: 'held' } },
  { s: 'third-of-may-1808', p: 'expresses', o: 'anti-war' },
  { s: 'demoiselles-d-avignon', p: 'created_by', o: 'picasso', qualifiers: { role: 'painter' } },
  { s: 'demoiselles-d-avignon', p: 'instance_of', o: 'cubism', confidence: 0.8 },
  { s: 'charnel-house', p: 'created_by', o: 'picasso', qualifiers: { role: 'painter' } },
  { s: 'charnel-house', p: 'expresses', o: 'anti-war' },
  // A causal reading only ever appears as a claim that cites who says so.
  { s: 'bombing-of-guernica', p: 'claims_cause', o: 'guernica',
    evidence: [{ source: WIKI, excerpt: 'Describes the painting as a response to the bombing.' }, { source: MUSEUM }] },
  { s: 'third-of-may-1808', p: 'claims_influence', o: 'guernica',
    evidence: [{ source: WIKI, relevance: 'contextual' }] },
];

/** Sequence and similarity links the system works out itself. Strength comes from shared signals. */
const COMPUTED: { s: string; p: 'precedes' | 'co_occurs_with' | 'similar_to'; o: string }[] = [
  { s: 'bombing-of-guernica', p: 'precedes', o: 'guernica' },
  { s: 'bombing-of-guernica', p: 'co_occurs_with', o: 'spanish-civil-war' },
  { s: 'guernica', p: 'co_occurs_with', o: 'paris-expo-1937' },
  { s: 'demoiselles-d-avignon', p: 'precedes', o: 'guernica' },
  { s: 'third-of-may-1808', p: 'precedes', o: 'guernica' },
  { s: 'guernica', p: 'precedes', o: 'charnel-house' },
  { s: 'guernica', p: 'similar_to', o: 'charnel-house' },
];

export async function seedGuernica(db: Db) {
  const bySlug = new Map(NODES.map((n) => [n.slug, n]));

  for (const n of NODES) {
    const id = seedId(n.slug);
    await db.insert(node).values({
      id, kindKey: n.kind, title: n.title, summary: n.summary,
      tags: n.tags ?? [], attributes: n.attributes ?? {},
    }).onConflictDoUpdate({
      target: node.id,
      set: { kindKey: n.kind, title: n.title, summary: n.summary, tags: n.tags ?? [], attributes: n.attributes ?? {} },
    });
    await db.delete(nodeTime).where(sql`${nodeTime.nodeId} = ${id}`);
    if (n.time) await db.insert(nodeTime).values({ nodeId: id, ...n.time });
    if (n.geo) {
      await db.insert(nodeGeo).values({ nodeId: id, ...n.geo })
        .onConflictDoUpdate({ target: nodeGeo.nodeId, set: { lon: n.geo.lon, lat: n.geo.lat } });
    }
  }

  // Where each node sits and who it is linked to, for the correlation signals.
  const placeOf = new Map<string, { lon: number; lat: number }>();
  const peopleOf = new Map<string, string[]>();
  for (const n of NODES) if (n.geo) placeOf.set(n.slug, n.geo);
  for (const st of STATEMENTS) {
    const target = bySlug.get(st.o);
    if (st.p === 'located_at' || st.p === 'presented_at') {
      const geo = target?.geo ?? placeOf.get(st.o);
      if (geo && !placeOf.has(st.s)) placeOf.set(st.s, geo);
    }
    if (st.p === 'created_by') peopleOf.set(st.s, [...(peopleOf.get(st.s) ?? []), st.o]);
  }
  const signalsFor = (slug: string) => ({
    year: bySlug.get(slug)?.time?.startYear,
    point: placeOf.get(slug),
    people: peopleOf.get(slug),
    tags: bySlug.get(slug)?.tags,
  });

  const all = [
    ...STATEMENTS.map((st) => ({ ...st, status: st.status ?? ('accepted' as const) })),
    ...COMPUTED.map((st) => {
      const result = linkStrength(signalsFor(st.s), signalsFor(st.o));
      return {
        ...st, status: 'computed' as const, confidence: result.strength,
        qualifiers: { why: result.why }, evidence: undefined,
      };
    }),
  ];

  for (const st of all) {
    const id = seedId(`${st.s}|${st.p}|${st.o}`);
    await db.insert(statement).values({
      id, subjectId: seedId(st.s), predicateKey: st.p, objectId: seedId(st.o),
      qualifiers: st.qualifiers ?? {}, confidence: st.confidence ?? 1, status: st.status,
    }).onConflictDoUpdate({
      target: statement.id,
      set: { qualifiers: st.qualifiers ?? {}, confidence: st.confidence ?? 1, status: st.status },
    });
    await db.delete(statementEvidence).where(sql`${statementEvidence.statementId} = ${id}`);
    for (const ev of st.evidence ?? []) {
      await db.insert(statementEvidence).values({
        statementId: id, sourceNodeId: seedId(ev.source),
        relevance: ev.relevance ?? 'supporting', excerpt: ev.excerpt,
      });
    }
  }

  return { nodes: NODES.length, statements: all.length };
}
