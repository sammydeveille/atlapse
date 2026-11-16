/**
 * Runs the graph routers against a real PostgreSQL database.
 * Skipped unless ATLAPSE_TEST_DB=1, with POSTGRES_HOST, POSTGRES_PORT,
 * POSTGRES_DB, POSTGRES_USER and POSTGRES_PASSWORD pointing at a database
 * that has the migrations applied.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../utils/log', () => ({ log: { debug: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const enabled = process.env.ATLAPSE_TEST_DB === '1';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

describe.skipIf(!enabled)('graph routers on a real database', () => {
  let app: Awaited<ReturnType<typeof setup>>;

  async function setup() {
    const { db } = await import('../db/index.js');
    const { sql } = await import('drizzle-orm');
    const { seedGuernica, seedRegistry, seedId } = await import('../seed/atlapse.js');
    const { appRouter } = await import('../router.js');
    await db.execute(sql`TRUNCATE statement_evidence, statement, node_geo, node_time, node, factbook_member, factbook, predicate, kind CASCADE`);
    await seedRegistry(db);
    await seedGuernica(db);
    // Running the seed twice must not duplicate anything.
    await seedGuernica(db);
    return { caller: appRouter.createCaller({}), seedId, db, sql };
  }

  beforeAll(async () => { app = await setup(); }, 30_000);

  it('seeds the registry and the sample once', async () => {
    const kinds = await app.caller.registry.kinds();
    expect(kinds.find((k) => k.key === 'painting')?.parentKey).toBe('work');
    const count = await app.db.execute(app.sql`SELECT count(*)::int AS n FROM node`);
    expect((count.rows[0] as { n: number }).n).toBe(20);
  });

  it('finds entries by text and says why', async () => {
    const result = await app.caller.node.search({ text: 'guernica' });
    const titles = result.items.map((i) => i.title);
    expect(titles[0]).toMatch(/Guernica/);
    expect(titles).toContain('Bombing of Guernica');
    expect(result.items[0].why).toContain('title');
    expect(result.epicentre).not.toBeNull();
  });

  it('filters by parent kind, class, tag and years', async () => {
    const works = await app.caller.node.search({ kinds: ['work'] });
    expect(works.total).toBe(4);
    expect(works.items.every((i) => i.baseKind === 'work')).toBe(true);
    // Ordered by time when there is no text.
    expect(works.items.map((i) => i.startYear)).toEqual([1814, 1907, 1937, 1944]);

    const people = await app.caller.node.search({ classes: ['person'] });
    expect(people.items.map((i) => i.title).sort()).toEqual(['Francisco Goya', 'Pablo Picasso']);

    const tagged = await app.caller.node.search({ tags: ['monochrome'] });
    expect(tagged.items.map((i) => i.title).sort()).toEqual(['Guernica', 'The Charnel House']);

    const thirties = await app.caller.node.search({ kinds: ['work', 'event'], fromYear: 1930, toYear: 1939 });
    expect(thirties.items.map((i) => i.title).sort()).toEqual([
      'Bombing of Guernica', 'Guernica', 'Paris International Exposition of 1937', 'Spanish Civil War',
    ]);
  });

  it('places a work on the globe through the place it is linked to', async () => {
    const guernica = await app.caller.node.get({ id: app.seedId('guernica') });
    expect(guernica.lon).not.toBeNull();
    expect(guernica.times[0].startYear).toBe(1937);
  });

  it('returns the neighbourhood, filtered by family', async () => {
    const id = app.seedId('guernica');
    const one = await app.caller.statement.neighbourhood({ nodeId: id, depth: 1 });
    const titles = one.nodes.map((n) => n.title);
    expect(titles).toContain('Pablo Picasso');
    expect(titles).toContain('Bombing of Guernica');
    expect(titles).not.toContain('Francisco Goya');
    expect(one.nodes.find((n) => n.id === id)?.distance).toBe(0);

    const two = await app.caller.statement.neighbourhood({ nodeId: id, depth: 2 });
    expect(two.nodes.map((n) => n.title)).toContain('Francisco Goya');

    const people = await app.caller.statement.neighbourhood({ nodeId: id, depth: 1, families: ['authorship'] });
    expect(people.edges.every((e) => e.family === 'authorship')).toBe(true);
    expect(people.nodes.map((n) => n.title).sort()).toEqual(['Guernica', 'Pablo Picasso']);
  });

  it('never stores a causal link without attribution, and marks sequence as computed', async () => {
    const id = app.seedId('guernica');
    const { edges } = await app.caller.statement.neighbourhood({ nodeId: id, depth: 1 });
    const claims = edges.filter((e) => e.family === 'claim');
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) expect(claim.evidenceCount > 0 || claim.attributedToId !== null).toBe(true);
    const sequence = edges.filter((e) => e.family === 'correlation');
    expect(sequence.every((e) => e.status === 'computed' && e.computed)).toBe(true);
    expect(sequence.every((e) => e.confidence > 0 && e.confidence <= 1)).toBe(true);

    const evidence = await app.caller.statement.evidence({ statementId: claims[0].id });
    expect(evidence.length).toBeGreaterThan(0);
    expect((evidence[0] as { renderer: string }).renderer).toBeTruthy();
  });

  describe('factbooks', () => {
    let bookId: string;
    let noteId: string;

    it('lets a user add a fact and a sourced claim to their own factbook', async () => {
      const book = await app.caller.factbook.create({ userId: OWNER, name: 'My Picasso notes' });
      bookId = book.id;
      expect(book.visibility).toBe('private');

      const note = await app.caller.node.create({
        userId: OWNER, factbookId: bookId, kindKey: 'web_link', title: 'My reading notes on Guernica',
        tags: ['Notes'], attributes: { url: 'https://example.org/notes' },
      });
      noteId = note.id;
      expect(note.tags).toEqual(['notes']);

      const claim = await app.caller.statement.create({
        userId: OWNER, factbookId: bookId,
        subjectId: app.seedId('demoiselles-d-avignon'), predicateKey: 'claims_influence',
        objectId: app.seedId('guernica'), evidence: [{ sourceNodeId: noteId }],
      });
      expect(claim.status).toBe('proposed');
    });

    it('rejects claims with no source, hand-written computed links and non-source evidence', async () => {
      const base = { userId: OWNER, factbookId: bookId, subjectId: app.seedId('cubism'), objectId: app.seedId('guernica') };
      await expect(app.caller.statement.create({ ...base, predicateKey: 'claims_cause' }))
        .rejects.toThrow(/needs a source/);
      await expect(app.caller.statement.create({ ...base, predicateKey: 'precedes' }))
        .rejects.toThrow(/computed by the system/);
      await expect(app.caller.statement.create({
        ...base, predicateKey: 'claims_cause', evidence: [{ sourceNodeId: app.seedId('picasso') }],
      })).rejects.toThrow(/not a source/);
      await expect(app.caller.statement.create({ ...base, predicateKey: 'no_such_thing' }))
        .rejects.toThrow(/Unknown predicate/);
    });

    it('keeps a private factbook private', async () => {
      const mine = await app.caller.node.search({ text: 'reading notes', userId: OWNER });
      expect(mine.total).toBe(1);
      for (const userId of [undefined, STRANGER, FRIEND]) {
        const theirs = await app.caller.node.search({ text: 'reading notes', userId });
        expect(theirs.total).toBe(0);
      }
      await expect(app.caller.node.get({ id: noteId, userId: STRANGER })).rejects.toThrow(/not found/i);

      const id = app.seedId('guernica');
      const asOwner = await app.caller.statement.neighbourhood({ nodeId: id, userId: OWNER });
      const asStranger = await app.caller.statement.neighbourhood({ nodeId: id, userId: STRANGER });
      expect(asOwner.edges.length).toBe(asStranger.edges.length + 1);
    });

    it('stops others writing to it', async () => {
      await expect(app.caller.node.create({
        userId: STRANGER, factbookId: bookId, kindKey: 'idea', title: 'Intruder',
      })).rejects.toThrow(/cannot add facts/);
      await expect(app.caller.factbook.update({ userId: STRANGER, id: bookId, visibility: 'public' }))
        .rejects.toThrow(/Only the owner/);
    });

    it('shares with chosen people, then with everyone', async () => {
      await app.caller.factbook.update({ userId: OWNER, id: bookId, visibility: 'shared' });
      await app.caller.factbook.setMember({ userId: OWNER, id: bookId, memberId: FRIEND, role: 'editor' });

      expect((await app.caller.node.search({ text: 'reading notes', userId: FRIEND })).total).toBe(1);
      expect((await app.caller.node.search({ text: 'reading notes', userId: STRANGER })).total).toBe(0);
      expect((await app.caller.factbook.list({ userId: FRIEND })).map((b) => (b as { role: string }).role)).toEqual(['editor']);

      // An editor can add, a stranger still cannot.
      const added = await app.caller.node.create({ userId: FRIEND, factbookId: bookId, kindKey: 'idea', title: 'Friend idea' });
      expect(added.createdBy).toBe(FRIEND);

      await app.caller.factbook.update({ userId: OWNER, id: bookId, visibility: 'public' });
      expect((await app.caller.node.search({ text: 'reading notes' })).total).toBe(1);
    });

    it('removes its facts when deleted, leaving the commons alone', async () => {
      await app.caller.factbook.delete({ userId: OWNER, id: bookId });
      expect((await app.caller.node.search({ text: 'reading notes', userId: OWNER })).total).toBe(0);
      const count = await app.db.execute(app.sql`SELECT count(*)::int AS n FROM node`);
      expect((count.rows[0] as { n: number }).n).toBe(20);
      await expect(app.caller.node.delete({ userId: OWNER, id: app.seedId('guernica') }))
        .rejects.toThrow(/cannot be deleted/);
    });
  });
});
