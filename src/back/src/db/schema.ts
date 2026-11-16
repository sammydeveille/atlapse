import { pgTable, uuid, varchar, text, timestamp, doublePrecision, jsonb, integer, index, uniqueIndex, customType, check, boolean, date, real, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom column type for PostGIS geometry
export const geometry = customType<{ data: string }>({
  dataType() {
    return 'geometry(Geometry, 4326)';
  },
  toDriver(value: string) {
    return value;
  },
  fromDriver(value: unknown) {
    return value as string;
  },
});

export const userProfile = pgTable('user_profile', {
  id: uuid('id').primaryKey(),
  preferences: jsonb('preferences').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const collection = pgTable('collection', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => userProfile.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  temporalStart: timestamp('temporal_start', { withTimezone: true }),
  temporalEnd: timestamp('temporal_end', { withTimezone: true }),
  spatialBounds: geometry('spatial_bounds'),
  presentation: jsonb('presentation').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_collection_owner_id').on(table.ownerId),
]);

export const dataLayer = pgTable('data_layer', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  renderType: varchar('render_type', { length: 20 }).notNull(),
  projection: varchar('projection', { length: 10 }).notNull().default('globe'),
  sourceMode: varchar('source_mode', { length: 20 }).notNull().default('data_points'),
  itemFilter: jsonb('item_filter'),
  schemaHint: jsonb('schema_hint'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const source = pgTable('source', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  baseUrl: text('base_url').notNull(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sourceDocument = pgTable('source_document', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => source.id),
  externalId: varchar('external_id', { length: 500 }).notNull(),
  rawContent: jsonb('raw_content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_source_document_source_external').on(table.sourceId, table.externalId),
  index('idx_source_document_content_hash').on(table.contentHash),
]);

export const knowledgeItem = pgTable('knowledge_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  summary: text('summary').notNull(),
  itemType: varchar('item_type', { length: 20 }).notNull(),
  content: text('content'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('knowledge_item_type_check', sql`${table.itemType} IN ('article', 'event', 'statistic', 'concept', 'place')`),
]);

export const itemEvidence = pgTable('item_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledgeItemId: uuid('knowledge_item_id').notNull().references(() => knowledgeItem.id, { onDelete: 'cascade' }),
  sourceDocumentId: uuid('source_document_id').notNull().references(() => sourceDocument.id, { onDelete: 'cascade' }),
  relevance: varchar('relevance', { length: 20 }).notNull(),
  excerpt: text('excerpt'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('item_evidence_relevance_check', sql`${table.relevance} IN ('primary', 'supporting', 'contextual')`),
]);

export const itemTime = pgTable('item_time', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledgeItemId: uuid('knowledge_item_id').notNull().references(() => knowledgeItem.id, { onDelete: 'cascade' }),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  precision: varchar('precision', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('item_time_precision_check', sql`${table.precision} IN ('year', 'month', 'day', 'hour', 'exact')`),
  check('item_time_range_check', sql`${table.endTime} IS NULL OR ${table.startTime} <= ${table.endTime}`),
]);

export const itemPlace = pgTable('item_place', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledgeItemId: uuid('knowledge_item_id').notNull().references(() => knowledgeItem.id, { onDelete: 'cascade' }),
  geometry: geometry('geometry').notNull(),
  placeName: varchar('place_name', { length: 255 }),
  precision: varchar('precision', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('item_place_precision_check', sql`${table.precision} IN ('exact', 'approximate', 'region')`),
  // GiST index on geometry is created via raw SQL in the migration:
  // CREATE INDEX idx_item_place_geometry ON item_place USING gist (geometry);
]);

export const presentation = pgTable('presentation', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').references(() => collection.id, { onDelete: 'set null' }),
  ownerId: uuid('owner_id').notNull().references(() => userProfile.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const presentationSlide = pgTable('presentation_slide', {
  id: uuid('id').primaryKey().defaultRandom(),
  presentationId: uuid('presentation_id').notNull().references(() => presentation.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  title: varchar('title', { length: 255 }),
  narratorNote: text('narrator_note'),
  viewState: jsonb('view_state').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const slideItem = pgTable('slide_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  slideId: uuid('slide_id').notNull().references(() => presentationSlide.id, { onDelete: 'cascade' }),
  knowledgeItemId: uuid('knowledge_item_id').notNull().references(() => knowledgeItem.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  annotation: text('annotation'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dataPoint = pgTable('data_point', {
  id: uuid('id').primaryKey().defaultRandom(),
  layerId: uuid('layer_id').notNull().references(() => dataLayer.id, { onDelete: 'cascade' }),
  geometry: geometry('geometry').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  temporalPrecision: varchar('temporal_precision', { length: 10 }).notNull(),
  value: doublePrecision('value').notNull(),
  metadata: jsonb('metadata'),
  mediaUrl: text('media_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_data_point_timestamp').on(table.timestamp),
  index('idx_data_point_layer_id').on(table.layerId),
  // GiST index on geometry is created via raw SQL in the migration
]);

// ─── AtLapse graph model ─────────────────────────────────────────────────────
// Nodes, statements and evidence, as described in the AtLapse framework guide.
// The older knowledge_item tables above stay until their seed data is ported.

/**
 * Kind registry. A node's kind is a row here, never a hard-coded enum.
 * Top-level kinds have no parent (work, source, event, place, individual, group,
 * form, current, idea). Sub-kinds point at their parent (painting -> work).
 * The class is the only fixed level: fact, person or concept.
 */
export const kind = pgTable('kind', {
  key: varchar('key', { length: 64 }).primaryKey(),
  class: varchar('class', { length: 16 }).notNull(),
  parentKey: varchar('parent_key', { length: 64 }).references((): AnyPgColumn => kind.key),
  label: varchar('label', { length: 120 }).notNull(),
  color: varchar('color', { length: 16 }),
  // For source sub-kinds: which evidence renderer shows it (article, video, post, link).
  renderer: varchar('renderer', { length: 32 }),
  attributesSchema: jsonb('attributes_schema').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('kind_class_check', sql`${table.class} IN ('fact', 'person', 'concept')`),
  index('idx_kind_parent').on(table.parentKey),
]);

/**
 * Predicate registry. The family decides how a link is drawn and worded.
 * computed: produced by the system from data (correlation, similarity).
 * attributed: a claim that must name who makes it or cite a source. The system
 * never asserts cause on its own.
 */
export const predicate = pgTable('predicate', {
  key: varchar('key', { length: 64 }).primaryKey(),
  family: varchar('family', { length: 32 }).notNull(),
  label: varchar('label', { length: 120 }).notNull(),
  inverseLabel: varchar('inverse_label', { length: 120 }).notNull(),
  computed: boolean('computed').notNull().default(false),
  attributed: boolean('attributed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('predicate_family_check', sql`${table.family} IN ('correlation', 'claim', 'authorship', 'membership', 'lineage', 'classification', 'location', 'evidence', 'similarity')`),
]);

/** A user's own list of facts. Nodes and statements with no factbook are the shared commons. */
export const factbook = pgTable('factbook', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => userProfile.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  visibility: varchar('visibility', { length: 16 }).notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('factbook_visibility_check', sql`${table.visibility} IN ('private', 'shared', 'public')`),
  index('idx_factbook_owner').on(table.ownerId),
]);

export const factbookMember = pgTable('factbook_member', {
  factbookId: uuid('factbook_id').notNull().references(() => factbook.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => userProfile.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 16 }).notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.factbookId, table.userId] }),
  check('factbook_member_role_check', sql`${table.role} IN ('viewer', 'editor')`),
]);

export const node = pgTable('node', {
  id: uuid('id').primaryKey().defaultRandom(),
  kindKey: varchar('kind_key', { length: 64 }).notNull().references(() => kind.key),
  title: varchar('title', { length: 500 }).notNull(),
  summary: text('summary').notNull().default(''),
  content: text('content'),
  // Kind-specific fields (url, medium, archiveUrl, reliability, imageUrl ...).
  attributes: jsonb('attributes').notNull().default({}),
  // Keywords used for search and for the shared-tags correlation signal.
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  factbookId: uuid('factbook_id').references(() => factbook.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => userProfile.id),
  // Reserved for the editorial curation step.
  review: varchar('review', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_node_kind').on(table.kindKey),
  index('idx_node_factbook').on(table.factbookId),
  // GIN indexes for full-text search and tags are added by raw SQL in the migration.
]);

/**
 * Time as whole years, so deep time fits. Negative years are BCE and there is
 * no year 0 (-1 is 1 BCE). start_date carries the exact day when one is known.
 */
export const nodeTime = pgTable('node_time', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  startYear: integer('start_year').notNull(),
  endYear: integer('end_year'),
  precision: varchar('precision', { length: 12 }).notNull().default('year'),
  startDate: date('start_date'),
  label: varchar('label', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('node_time_precision_check', sql`${table.precision} IN ('millennium', 'century', 'decade', 'year', 'month', 'day')`),
  check('node_time_year_zero_check', sql`${table.startYear} <> 0 AND (${table.endYear} IS NULL OR ${table.endYear} <> 0)`),
  check('node_time_range_check', sql`${table.endYear} IS NULL OR ${table.startYear} <= ${table.endYear}`),
  index('idx_node_time_node').on(table.nodeId),
  index('idx_node_time_start').on(table.startYear),
]);

/** A point for the globe. Usually set on Place nodes; other nodes reach places through statements. */
export const nodeGeo = pgTable('node_geo', {
  nodeId: uuid('node_id').primaryKey().references(() => node.id, { onDelete: 'cascade' }),
  lon: doublePrecision('lon').notNull(),
  lat: doublePrecision('lat').notNull(),
  precision: varchar('precision', { length: 20 }).notNull().default('approximate'),
}, (table) => [
  check('node_geo_precision_check', sql`${table.precision} IN ('exact', 'approximate', 'region')`),
  check('node_geo_range_check', sql`${table.lon} BETWEEN -180 AND 180 AND ${table.lat} BETWEEN -90 AND 90`),
]);

/**
 * subject -predicate-> object. The object is a node, or another statement
 * (for example a source disputing a claim), never both.
 */
export const statement = pgTable('statement', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  predicateKey: varchar('predicate_key', { length: 64 }).notNull().references(() => predicate.key),
  objectId: uuid('object_id').references(() => node.id, { onDelete: 'cascade' }),
  objectStatementId: uuid('object_statement_id').references((): AnyPgColumn => statement.id, { onDelete: 'cascade' }),
  // role, fromYear, toYear, note ...
  qualifiers: jsonb('qualifiers').notNull().default({}),
  confidence: real('confidence').notNull().default(1),
  status: varchar('status', { length: 16 }).notNull().default('proposed'),
  // For claims: the person or group node making the claim.
  attributedToId: uuid('attributed_to_id').references(() => node.id, { onDelete: 'set null' }),
  factbookId: uuid('factbook_id').references(() => factbook.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => userProfile.id),
  review: varchar('review', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('statement_one_object_check', sql`(${table.objectId} IS NOT NULL) <> (${table.objectStatementId} IS NOT NULL)`),
  check('statement_status_check', sql`${table.status} IN ('computed', 'proposed', 'accepted', 'disputed')`),
  check('statement_confidence_check', sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
  index('idx_statement_subject').on(table.subjectId),
  index('idx_statement_object').on(table.objectId),
  index('idx_statement_predicate').on(table.predicateKey),
  index('idx_statement_factbook').on(table.factbookId),
]);

/** Evidence hangs on a statement and points at a Source node. */
export const statementEvidence = pgTable('statement_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  statementId: uuid('statement_id').notNull().references(() => statement.id, { onDelete: 'cascade' }),
  sourceNodeId: uuid('source_node_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  relevance: varchar('relevance', { length: 20 }).notNull().default('supporting'),
  excerpt: text('excerpt'),
  // Page, timestamp or section inside the source.
  locator: varchar('locator', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('statement_evidence_relevance_check', sql`${table.relevance} IN ('primary', 'supporting', 'contextual')`),
  index('idx_statement_evidence_statement').on(table.statementId),
  index('idx_statement_evidence_source').on(table.sourceNodeId),
]);
