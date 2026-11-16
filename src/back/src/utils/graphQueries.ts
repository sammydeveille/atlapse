import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { visibleTo } from './scope.js';

export interface NodeCard {
  id: string;
  kindKey: string;
  kindLabel: string;
  class: string;
  /** The top-level kind (work, source, event ...), equal to kindKey when there is no parent. */
  baseKind: string;
  color: string | null;
  renderer: string | null;
  title: string;
  summary: string;
  tags: string[];
  attributes: Record<string, unknown>;
  factbookId: string | null;
  startYear: number | null;
  endYear: number | null;
  precision: string | null;
  lon: number | null;
  lat: number | null;
}

/**
 * One row per node with its kind, first time span and a point for the globe.
 * The point is the node's own, or that of a place it is linked to.
 */
export function nodeCardSelect(extraColumns: SQL = sql``): SQL {
  return sql`
    SELECT n.id, n.kind_key AS "kindKey", k.label AS "kindLabel", k.class,
           COALESCE(k.parent_key, k.key) AS "baseKind", k.color, k.renderer,
           n.title, n.summary, n.tags, n.attributes, n.factbook_id AS "factbookId",
           tm.start_year AS "startYear", tm.end_year AS "endYear", tm.precision,
           COALESCE(g.lon, via.lon) AS lon, COALESCE(g.lat, via.lat) AS lat
           ${extraColumns}
    FROM node n
    JOIN kind k ON k.key = n.kind_key
    LEFT JOIN LATERAL (
      SELECT nt.start_year, nt.end_year, nt.precision FROM node_time nt
      WHERE nt.node_id = n.id ORDER BY nt.start_year LIMIT 1
    ) tm ON true
    LEFT JOIN node_geo g ON g.node_id = n.id
    LEFT JOIN LATERAL (
      SELECT pg.lon, pg.lat FROM statement s
      JOIN predicate p ON p.key = s.predicate_key AND p.family = 'location'
      JOIN node_geo pg ON pg.node_id = s.object_id
      WHERE s.subject_id = n.id LIMIT 1
    ) via ON true`;
}

export async function fetchNodeCards(ids: string[], userId?: string): Promise<NodeCard[]> {
  if (ids.length === 0) return [];
  const result = await db.execute(sql`
    ${nodeCardSelect()}
    WHERE n.id IN ${ids} AND ${visibleTo(sql`n.factbook_id`, userId)}
  `);
  return result.rows as unknown as NodeCard[];
}

export interface Edge {
  id: string;
  subjectId: string;
  predicateKey: string;
  family: string;
  label: string;
  inverseLabel: string;
  computed: boolean;
  attributed: boolean;
  objectId: string | null;
  objectStatementId: string | null;
  qualifiers: Record<string, unknown>;
  confidence: number;
  status: string;
  attributedToId: string | null;
  factbookId: string | null;
  evidenceCount: number;
}

const edgeSelect = sql`
  SELECT s.id, s.subject_id AS "subjectId", s.predicate_key AS "predicateKey",
         p.family, p.label, p.inverse_label AS "inverseLabel", p.computed, p.attributed,
         s.object_id AS "objectId", s.object_statement_id AS "objectStatementId",
         s.qualifiers, s.confidence, s.status, s.attributed_to_id AS "attributedToId",
         s.factbook_id AS "factbookId",
         (SELECT count(*)::int FROM statement_evidence se WHERE se.statement_id = s.id) AS "evidenceCount"
  FROM statement s
  JOIN predicate p ON p.key = s.predicate_key`;

/** Statements that touch any of the given nodes, in either direction. */
export async function fetchEdgesTouching(
  nodeIds: string[],
  opts: { userId?: string; families?: string[]; limit: number },
): Promise<Edge[]> {
  if (nodeIds.length === 0) return [];
  const familyFilter = opts.families?.length ? sql`AND p.family IN ${opts.families}` : sql``;
  const result = await db.execute(sql`
    ${edgeSelect}
    WHERE (s.subject_id IN ${nodeIds} OR s.object_id IN ${nodeIds})
      AND ${visibleTo(sql`s.factbook_id`, opts.userId)}
      ${familyFilter}
    ORDER BY s.confidence DESC, s.created_at
    LIMIT ${opts.limit}
  `);
  return result.rows as unknown as Edge[];
}

/** Statements about other statements, for example a source disputing a claim. */
export async function fetchEdgesAboutStatements(statementIds: string[], userId?: string): Promise<Edge[]> {
  if (statementIds.length === 0) return [];
  const result = await db.execute(sql`
    ${edgeSelect}
    WHERE s.object_statement_id IN ${statementIds} AND ${visibleTo(sql`s.factbook_id`, userId)}
  `);
  return result.rows as unknown as Edge[];
}
