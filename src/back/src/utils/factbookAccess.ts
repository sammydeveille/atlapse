import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { factbook, factbookMember } from '../db/schema.js';

export async function getFactbookOrThrow(factbookId: string) {
  const [found] = await db.select().from(factbook).where(eq(factbook.id, factbookId));
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Factbook not found' });
  return found;
}

export async function assertFactbookOwner(factbookId: string, userId: string) {
  const found = await getFactbookOrThrow(factbookId);
  if (found.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the owner can do this' });
  return found;
}

/** The owner and editor members may add facts to a factbook. */
export async function assertCanWrite(factbookId: string, userId: string) {
  const found = await getFactbookOrThrow(factbookId);
  if (found.ownerId === userId) return found;
  const [member] = await db.select().from(factbookMember)
    .where(and(eq(factbookMember.factbookId, factbookId), eq(factbookMember.userId, userId)));
  if (member?.role === 'editor') return found;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot add facts to this factbook' });
}
