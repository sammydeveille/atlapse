import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, sql, type SQL } from 'drizzle-orm';
import { procedure, t } from '../trpc.js';
import { db } from '../db/index.js';
import { kind, node, nodeGeo, nodeTime } from '../db/schema.js';
import { actingUserSchema, createNodeSchema, optionalUserSchema, searchNodesSchema } from '../types/graph.js';
import { ensureProfile } from '../utils/profile.js';
import { assertCanWrite } from '../utils/factbookAccess.js';
import { visibleTo } from '../utils/scope.js';
import { epicentre } from '../utils/correlation.js';
import { fetchNodeCards, nodeCardSelect, type NodeCard } from '../utils/graphQueries.js';

const createInFactbookSchema = createNodeSchema.and(z.object({ factbookId: z.string().uuid() }));

export const nodeRouter = t.router({
  /**
   * Users add facts to a factbook they own or edit. The shared commons is
   * filled by seeds and ingestion, not through this route.
   */
  create: procedure.input(createInFactbookSchema).mutation(async ({ input }) => {
    await ensureProfile(input.userId);
    await assertCanWrite(input.factbookId, input.userId);

    const [foundKind] = await db.select().from(kind).where(eq(kind.key, input.kindKey));
    if (!foundKind) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown kind: ${input.kindKey}` });

    return db.transaction(async (tx) => {
      const [created] = await tx.insert(node).values({
        kindKey: input.kindKey,
        title: input.title,
        summary: input.summary,
        content: input.content,
        attributes: input.attributes,
        tags: [...new Set(input.tags)],
        factbookId: input.factbookId,
        createdBy: input.userId,
      }).returning();

      if (input.times.length > 0) {
        await tx.insert(nodeTime).values(input.times.map((time) => ({ nodeId: created.id, ...time })));
      }
      if (input.geo) {
        await tx.insert(nodeGeo).values({ nodeId: created.id, ...input.geo });
      }
      return created;
    });
  }),

  get: procedure
    .input(optionalUserSchema.extend({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [card] = await fetchNodeCards([input.id], input.userId);
      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Node not found' });
      const [full] = await db.select({ content: node.content }).from(node).where(eq(node.id, input.id));
      const times = await db.select().from(nodeTime).where(eq(nodeTime.nodeId, input.id)).orderBy(nodeTime.startYear);
      return { ...card, content: full?.content ?? null, times };
    }),

  delete: procedure
    .input(actingUserSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [found] = await db.select().from(node).where(eq(node.id, input.id));
      if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Node not found' });
      if (!found.factbookId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Shared entries cannot be deleted here' });
      await assertCanWrite(found.factbookId, input.userId);
      await db.delete(node).where(eq(node.id, input.id));
      return { success: true };
    }),

  /**
   * Keyword and tag search with kind, class, time and factbook filters.
   * Each result says why it matched. The response also carries the geographic
   * centre of the results, which the globe backdrop turns to.
   */
  search: procedure.input(searchNodesSchema).query(async ({ input }) => {
    const conditions: SQL[] = [visibleTo(sql`n.factbook_id`, input.userId)];
    const doc = sql`to_tsvector('english', n.title || ' ' || n.summary || ' ' || COALESCE(n.content, ''))`;

    let matchColumns = sql`, 0::real AS rank, false AS "matchedText", false AS "matchedTitle", '{}'::text[] AS "matchedTags"`;
    let orderBy = sql`tm.start_year NULLS LAST, n.title`;

    const words = input.text ? input.text.toLowerCase().split(/\s+/).filter(Boolean) : [];
    const wantedTags = [...new Set([...(input.tags ?? [])])];

    if (input.text) {
      const query = sql`plainto_tsquery('english', ${input.text})`;
      const titleLike = `%${input.text.replace(/[%_\\]/g, '\\$&')}%`;
      const wordTags = sql`ARRAY[${sql.join(words.map((w) => sql`${w}`), sql`, `)}]::text[]`;
      conditions.push(sql`(${doc} @@ ${query} OR n.title ILIKE ${titleLike} OR n.tags && ${wordTags})`);
      matchColumns = sql`,
        (ts_rank(${doc}, ${query})
          + CASE WHEN n.title ILIKE ${titleLike} THEN 1 ELSE 0 END
          + CASE WHEN n.tags && ${wordTags} THEN 0.5 ELSE 0 END)::real AS rank,
        (${doc} @@ ${query}) AS "matchedText",
        (n.title ILIKE ${titleLike}) AS "matchedTitle",
        ARRAY(SELECT unnest(n.tags) INTERSECT SELECT unnest(${wordTags})) AS "matchedTags"`;
      orderBy = sql`rank DESC, tm.start_year NULLS LAST, n.title`;
    }

    if (wantedTags.length > 0) {
      conditions.push(sql`n.tags @> ARRAY[${sql.join(wantedTags.map((tag) => sql`${tag}`), sql`, `)}]::text[]`);
    }
    if (input.kinds?.length) {
      conditions.push(sql`(n.kind_key IN ${input.kinds} OR k.parent_key IN ${input.kinds})`);
    }
    if (input.classes?.length) {
      conditions.push(sql`k.class IN ${input.classes}`);
    }
    if (input.factbookId) {
      conditions.push(sql`n.factbook_id = ${input.factbookId}::uuid`);
    }
    if (input.fromYear !== undefined || input.toYear !== undefined) {
      const from = input.fromYear ?? -1_000_000;
      const to = input.toYear ?? 10_000;
      conditions.push(sql`EXISTS (
        SELECT 1 FROM node_time ft WHERE ft.node_id = n.id
        AND ft.start_year <= ${to} AND COALESCE(ft.end_year, ft.start_year) >= ${from})`);
    }

    const where = sql.join(conditions, sql` AND `);
    const [data, count] = await Promise.all([
      db.execute(sql`
        ${nodeCardSelect(matchColumns)}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${input.pageSize} OFFSET ${input.page * input.pageSize}
      `),
      db.execute(sql`
        SELECT count(*)::int AS total FROM node n JOIN kind k ON k.key = n.kind_key WHERE ${where}
      `),
    ]);

    type Row = NodeCard & { rank: number; matchedText: boolean; matchedTitle: boolean; matchedTags: string[] };
    const items = (data.rows as unknown as Row[]).map(({ matchedText, matchedTitle, matchedTags, ...card }) => {
      const why: string[] = [];
      if (matchedTitle) why.push('title');
      else if (matchedText) why.push('text');
      for (const tag of matchedTags ?? []) why.push(`tag: ${tag}`);
      for (const tag of wantedTags) why.push(`tag: ${tag}`);
      return { ...card, why: [...new Set(why)] };
    });

    const points = items
      .filter((item) => item.lon !== null && item.lat !== null)
      .map((item) => ({ lon: item.lon as number, lat: item.lat as number }));

    return {
      items,
      total: Number((count.rows[0] as { total: number } | undefined)?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
      epicentre: epicentre(points),
    };
  }),
});
