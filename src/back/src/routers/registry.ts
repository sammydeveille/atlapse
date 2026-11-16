import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { procedure, t } from '../trpc.js';
import { db } from '../db/index.js';
import { kind, predicate } from '../db/schema.js';
import { createKindSchema, createPredicateSchema } from '../types/graph.js';

export const registryRouter = t.router({
  kinds: procedure.query(() => db.select().from(kind).orderBy(asc(kind.class), asc(kind.key))),

  predicates: procedure.query(() => db.select().from(predicate).orderBy(asc(predicate.family), asc(predicate.key))),

  /** New kinds are data. A sub-kind takes its parent's class. */
  createKind: procedure.input(createKindSchema).mutation(async ({ input }) => {
    if (input.parentKey) {
      const [parent] = await db.select().from(kind).where(eq(kind.key, input.parentKey));
      if (!parent) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown parent kind: ${input.parentKey}` });
      if (parent.class !== input.class) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `A sub-kind of ${parent.key} must be in class ${parent.class}` });
      }
    }
    const [created] = await db.insert(kind).values(input).onConflictDoNothing().returning();
    if (!created) throw new TRPCError({ code: 'CONFLICT', message: `Kind already exists: ${input.key}` });
    return created;
  }),

  createPredicate: procedure.input(createPredicateSchema).mutation(async ({ input }) => {
    const [created] = await db.insert(predicate).values(input).onConflictDoNothing().returning();
    if (!created) throw new TRPCError({ code: 'CONFLICT', message: `Predicate already exists: ${input.key}` });
    return created;
  }),
});
