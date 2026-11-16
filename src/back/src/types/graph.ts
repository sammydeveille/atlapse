import { z } from 'zod';
import { PREDICATE_FAMILIES } from '../registry/defaults.js';

export const kindClassSchema = z.enum(['fact', 'person', 'concept']);
export const predicateFamilySchema = z.enum(PREDICATE_FAMILIES);
export const visibilitySchema = z.enum(['private', 'shared', 'public']);
export const timePrecisionSchema = z.enum(['millennium', 'century', 'decade', 'year', 'month', 'day']);
export const statementStatusSchema = z.enum(['computed', 'proposed', 'accepted', 'disputed']);

/** A whole year. Negative is BCE. There is no year 0. */
export const yearSchema = z.number().int().min(-1_000_000).max(10_000).refine((y) => y !== 0, {
  message: 'There is no year 0. Use -1 for 1 BCE.',
});

const keySchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'Use lowercase letters, digits and underscores');

/**
 * Prototype stand-in for the signed-in user. Auth is a later phase, so every
 * write names its acting user here. Swap this for the session user in one place.
 */
export const actingUserSchema = z.object({ userId: z.string().uuid() });
export const optionalUserSchema = z.object({ userId: z.string().uuid().optional() });

export const createKindSchema = z.object({
  key: keySchema,
  class: kindClassSchema,
  parentKey: keySchema.optional(),
  label: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  renderer: z.string().max(32).optional(),
  attributesSchema: z.record(z.unknown()).optional(),
});

export const createPredicateSchema = z.object({
  key: keySchema,
  family: predicateFamilySchema,
  label: z.string().trim().min(1).max(120),
  inverseLabel: z.string().trim().min(1).max(120),
  computed: z.boolean().optional(),
  attributed: z.boolean().optional(),
});

export const nodeTimeInputSchema = z.object({
  startYear: yearSchema,
  endYear: yearSchema.optional(),
  precision: timePrecisionSchema.default('year'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  label: z.string().max(64).optional(),
}).refine((t) => t.endYear === undefined || t.startYear <= t.endYear, {
  message: 'endYear must not be before startYear',
});

export const nodeGeoInputSchema = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  precision: z.enum(['exact', 'approximate', 'region']).default('approximate'),
});

export const tagSchema = z.string().trim().toLowerCase().min(1).max(64);

export const createNodeSchema = actingUserSchema.extend({
  kindKey: keySchema,
  title: z.string().trim().min(1).max(500),
  summary: z.string().max(4000).default(''),
  content: z.string().optional(),
  attributes: z.record(z.unknown()).default({}),
  tags: z.array(tagSchema).max(50).default([]),
  factbookId: z.string().uuid().optional(),
  times: z.array(nodeTimeInputSchema).max(10).default([]),
  geo: nodeGeoInputSchema.optional(),
});

export const evidenceInputSchema = z.object({
  sourceNodeId: z.string().uuid(),
  relevance: z.enum(['primary', 'supporting', 'contextual']).default('supporting'),
  excerpt: z.string().max(1000).optional(),
  locator: z.string().max(120).optional(),
});

export const createStatementSchema = actingUserSchema.extend({
  subjectId: z.string().uuid(),
  predicateKey: keySchema,
  objectId: z.string().uuid().optional(),
  objectStatementId: z.string().uuid().optional(),
  qualifiers: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(1),
  attributedToId: z.string().uuid().optional(),
  factbookId: z.string().uuid().optional(),
  evidence: z.array(evidenceInputSchema).max(20).default([]),
}).refine((s) => (s.objectId !== undefined) !== (s.objectStatementId !== undefined), {
  message: 'Give exactly one of objectId or objectStatementId',
});

export const searchNodesSchema = optionalUserSchema.extend({
  text: z.string().trim().max(200).optional(),
  tags: z.array(tagSchema).max(20).optional(),
  kinds: z.array(keySchema).max(30).optional(),
  classes: z.array(kindClassSchema).optional(),
  fromYear: yearSchema.optional(),
  toYear: yearSchema.optional(),
  factbookId: z.string().uuid().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const neighbourhoodSchema = optionalUserSchema.extend({
  nodeId: z.string().uuid(),
  depth: z.number().int().min(1).max(3).default(1),
  families: z.array(predicateFamilySchema).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const createFactbookSchema = actingUserSchema.extend({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: visibilitySchema.default('private'),
});
