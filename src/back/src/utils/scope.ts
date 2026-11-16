import { sql, type SQL } from 'drizzle-orm';

/**
 * Who can see a row that carries a factbook_id.
 * No factbook means the shared commons. Otherwise the factbook must be public,
 * owned by the viewer, or shared with the viewer.
 *
 * `column` is the qualified factbook_id column, for example sql`n.factbook_id`.
 */
export function visibleTo(column: SQL, userId?: string): SQL {
  if (!userId) {
    return sql`(${column} IS NULL OR EXISTS (
      SELECT 1 FROM factbook fb WHERE fb.id = ${column} AND fb.visibility = 'public'))`;
  }
  return sql`(${column} IS NULL OR EXISTS (
    SELECT 1 FROM factbook fb WHERE fb.id = ${column} AND (
      fb.visibility = 'public'
      OR fb.owner_id = ${userId}::uuid
      OR (fb.visibility = 'shared' AND EXISTS (
        SELECT 1 FROM factbook_member fm WHERE fm.factbook_id = fb.id AND fm.user_id = ${userId}::uuid))
    )))`;
}
