import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { procedure, t } from '../trpc.js';
import { db } from '../db/index.js';
import { factbook, factbookMember } from '../db/schema.js';
import { actingUserSchema, createFactbookSchema, visibilitySchema } from '../types/graph.js';
import { ensureProfile } from '../utils/profile.js';
import { assertFactbookOwner } from '../utils/factbookAccess.js';

export const factbookRouter = t.router({
  /** Factbooks the user owns or has been given access to. */
  list: procedure.input(actingUserSchema).query(async ({ input }) => {
    const result = await db.execute(sql`
      SELECT fb.id, fb.owner_id AS "ownerId", fb.name, fb.description, fb.visibility,
             fb.created_at AS "createdAt", fb.updated_at AS "updatedAt",
             CASE WHEN fb.owner_id = ${input.userId}::uuid THEN 'owner' ELSE fm.role END AS role,
             (SELECT count(*)::int FROM node n WHERE n.factbook_id = fb.id) AS "nodeCount",
             (SELECT count(*)::int FROM statement s WHERE s.factbook_id = fb.id) AS "statementCount"
      FROM factbook fb
      LEFT JOIN factbook_member fm ON fm.factbook_id = fb.id AND fm.user_id = ${input.userId}::uuid
      WHERE fb.owner_id = ${input.userId}::uuid OR (fb.visibility = 'shared' AND fm.user_id IS NOT NULL)
      ORDER BY fb.updated_at DESC
    `);
    return result.rows;
  }),

  create: procedure.input(createFactbookSchema).mutation(async ({ input }) => {
    await ensureProfile(input.userId);
    const [created] = await db.insert(factbook).values({
      ownerId: input.userId,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
    }).returning();
    return created;
  }),

  update: procedure
    .input(actingUserSchema.extend({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().max(2000).optional(),
      visibility: visibilitySchema.optional(),
    }))
    .mutation(async ({ input }) => {
      await assertFactbookOwner(input.id, input.userId);
      const { id, userId: _userId, ...changes } = input;
      const [updated] = await db.update(factbook)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(factbook.id, id))
        .returning();
      return updated;
    }),

  delete: procedure
    .input(actingUserSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await assertFactbookOwner(input.id, input.userId);
      await db.delete(factbook).where(eq(factbook.id, input.id));
      return { success: true };
    }),

  /** Share with one more person, or change their role. Only matters while visibility is "shared". */
  setMember: procedure
    .input(actingUserSchema.extend({
      id: z.string().uuid(),
      memberId: z.string().uuid(),
      role: z.enum(['viewer', 'editor']).default('viewer'),
    }))
    .mutation(async ({ input }) => {
      await assertFactbookOwner(input.id, input.userId);
      await ensureProfile(input.memberId);
      const [member] = await db.insert(factbookMember)
        .values({ factbookId: input.id, userId: input.memberId, role: input.role })
        .onConflictDoUpdate({
          target: [factbookMember.factbookId, factbookMember.userId],
          set: { role: input.role },
        })
        .returning();
      return member;
    }),

  removeMember: procedure
    .input(actingUserSchema.extend({ id: z.string().uuid(), memberId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await assertFactbookOwner(input.id, input.userId);
      await db.delete(factbookMember)
        .where(and(eq(factbookMember.factbookId, input.id), eq(factbookMember.userId, input.memberId)));
      return { success: true };
    }),
});
