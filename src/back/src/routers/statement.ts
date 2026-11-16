import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';
import { procedure, t } from '../trpc.js';
import { db } from '../db/index.js';
import { predicate, statement, statementEvidence } from '../db/schema.js';
import { actingUserSchema, createStatementSchema, neighbourhoodSchema, optionalUserSchema } from '../types/graph.js';
import { ensureProfile } from '../utils/profile.js';
import { assertCanWrite } from '../utils/factbookAccess.js';
import { visibleTo } from '../utils/scope.js';
import { epicentre } from '../utils/correlation.js';
import {
  fetchEdgesAboutStatements, fetchEdgesTouching, fetchNodeCards, type Edge,
} from '../utils/graphQueries.js';

const createInFactbookSchema = createStatementSchema.and(z.object({ factbookId: z.string().uuid() }));

export const statementRouter = t.router({
  /**
   * Add a link between two entries (or about another link) to a factbook.
   * Rules from the guide:
   * - computed predicates belong to the system and cannot be written by hand
   * - a claim must cite a source or name who makes it
   * - evidence must point at Source entries
   */
  create: procedure.input(createInFactbookSchema).mutation(async ({ input }) => {
    await ensureProfile(input.userId);
    await assertCanWrite(input.factbookId, input.userId);

    const [found] = await db.select().from(predicate).where(eq(predicate.key, input.predicateKey));
    if (!found) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown predicate: ${input.predicateKey}` });
    if (found.computed) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `"${found.label}" links are computed by the system` });
    }
    if (found.attributed && input.evidence.length === 0 && !input.attributedToId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A claim needs a source or the name of who makes it',
      });
    }
    if (input.objectId && input.objectId === input.subjectId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'An entry cannot link to itself' });
    }

    const endpointIds = [input.subjectId, input.objectId, input.attributedToId]
      .filter((id): id is string => Boolean(id));
    const sourceIds = input.evidence.map((e) => e.sourceNodeId);
    const cards = await fetchNodeCards([...new Set([...endpointIds, ...sourceIds])], input.userId);
    const byId = new Map(cards.map((card) => [card.id, card]));

    for (const id of endpointIds) {
      if (!byId.has(id)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Entry not found: ${id}` });
    }
    if (input.attributedToId && byId.get(input.attributedToId)?.class !== 'person') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A claim can only be attributed to a person or group' });
    }
    for (const id of sourceIds) {
      const card = byId.get(id);
      if (!card) throw new TRPCError({ code: 'BAD_REQUEST', message: `Source not found: ${id}` });
      if (card.baseKind !== 'source') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `"${card.title}" is not a source` });
      }
    }
    if (input.objectStatementId) {
      const target = await db.execute(sql`
        SELECT 1 FROM statement s WHERE s.id = ${input.objectStatementId}::uuid
        AND ${visibleTo(sql`s.factbook_id`, input.userId)}`);
      if (target.rows.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Target link not found' });
    }

    return db.transaction(async (tx) => {
      const [created] = await tx.insert(statement).values({
        subjectId: input.subjectId,
        predicateKey: input.predicateKey,
        objectId: input.objectId,
        objectStatementId: input.objectStatementId,
        qualifiers: input.qualifiers,
        confidence: input.confidence,
        status: 'proposed',
        attributedToId: input.attributedToId,
        factbookId: input.factbookId,
        createdBy: input.userId,
      }).returning();

      if (input.evidence.length > 0) {
        await tx.insert(statementEvidence).values(
          input.evidence.map((e) => ({ statementId: created.id, ...e })),
        );
      }
      return created;
    });
  }),

  delete: procedure
    .input(actingUserSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [found] = await db.select().from(statement).where(eq(statement.id, input.id));
      if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Link not found' });
      if (!found.factbookId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Shared links cannot be deleted here' });
      await assertCanWrite(found.factbookId, input.userId);
      await db.delete(statement).where(eq(statement.id, input.id));
      return { success: true };
    }),

  /** Evidence for one link, with the source entries ready for their renderer. */
  evidence: procedure
    .input(optionalUserSchema.extend({ statementId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await db.execute(sql`
        SELECT se.id, se.relevance, se.excerpt, se.locator,
               src.id AS "sourceId", src.title, src.summary, src.attributes,
               src.kind_key AS "kindKey", k.label AS "kindLabel", k.renderer
        FROM statement_evidence se
        JOIN statement s ON s.id = se.statement_id
        JOIN node src ON src.id = se.source_node_id
        JOIN kind k ON k.key = src.kind_key
        WHERE se.statement_id = ${input.statementId}::uuid
          AND ${visibleTo(sql`s.factbook_id`, input.userId)}
          AND ${visibleTo(sql`src.factbook_id`, input.userId)}
        ORDER BY CASE se.relevance WHEN 'primary' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END
      `);
      return result.rows;
    }),

  /**
   * The graph around one entry, for the Graph and Lineage lenses.
   * Walks out up to three steps, optionally keeping only some link families.
   */
  neighbourhood: procedure.input(neighbourhoodSchema).query(async ({ input }) => {
    const [focus] = await fetchNodeCards([input.nodeId], input.userId);
    if (!focus) throw new TRPCError({ code: 'NOT_FOUND', message: 'Node not found' });

    const seen = new Set<string>([input.nodeId]);
    const edges = new Map<string, Edge>();
    const distance = new Map<string, number>([[input.nodeId, 0]]);
    let frontier = [input.nodeId];

    for (let step = 1; step <= input.depth && frontier.length > 0; step += 1) {
      const remaining = input.limit - edges.size;
      if (remaining <= 0) break;
      const found = await fetchEdgesTouching(frontier, {
        userId: input.userId, families: input.families, limit: remaining,
      });
      const next: string[] = [];
      for (const edge of found) {
        edges.set(edge.id, edge);
        for (const id of [edge.subjectId, edge.objectId]) {
          if (id && !seen.has(id)) {
            seen.add(id);
            distance.set(id, step);
            next.push(id);
          }
        }
      }
      frontier = next;
    }

    const about = await fetchEdgesAboutStatements([...edges.keys()], input.userId);
    for (const edge of about) {
      edges.set(edge.id, edge);
      if (!seen.has(edge.subjectId)) {
        seen.add(edge.subjectId);
        distance.set(edge.subjectId, input.depth);
      }
    }

    const cards = await fetchNodeCards([...seen], input.userId);
    const visible = new Set(cards.map((card) => card.id));
    const nodes = cards.map((card) => ({ ...card, distance: distance.get(card.id) ?? input.depth }));
    // Drop links whose other end the viewer may not see.
    const visibleEdges = [...edges.values()].filter(
      (edge) => visible.has(edge.subjectId) && (!edge.objectId || visible.has(edge.objectId)),
    );

    const points = nodes
      .filter((n) => n.lon !== null && n.lat !== null)
      .map((n) => ({ lon: n.lon as number, lat: n.lat as number }));

    return { focusId: input.nodeId, nodes, edges: visibleEdges, epicentre: epicentre(points) };
  }),
});
