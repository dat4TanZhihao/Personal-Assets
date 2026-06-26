import { describe, expect, it } from 'vitest';
import { PostgresRepository, type Queryable } from '../../shared/src/repositories/postgres';

describe('PostgresRepository', () => {
  it('upserts documents into collection-named jsonb tables', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repo = new PostgresRepository(mockDb(queries));
    const holding = {
      _id: 'holding-a',
      userId: 'owner',
      accountId: 'account-a',
      assetType: 'FUND',
      symbol: '000001',
      name: 'Sample fund',
      quantity: 10,
      costAmount: 20,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z'
    } as const;

    await repo.set('holdings', holding);

    expect(queries[0].text).toContain('insert into "holdings"');
    expect(queries[0].text).toContain('on conflict (_id) do update');
    expect(queries[0].values).toEqual([
      'holding-a',
      JSON.stringify(holding),
      'owner'
    ]);
  });

  it('lists with Partial filters through jsonb containment and applies function filters in JS', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repo = new PostgresRepository(mockDb(queries, [
      { _id: 'a', data: { _id: 'a', userId: 'owner', active: true } },
      { _id: 'b', data: { _id: 'b', userId: 'owner', active: false } }
    ]));

    const partial = await repo.list('holdings', { userId: 'owner' } as never);
    const filtered = await repo.list('holdings', (doc) => doc.active);

    expect(partial).toHaveLength(2);
    expect(queries[0].text).toContain('data @>');
    expect(queries[0].values).toEqual([JSON.stringify({ userId: 'owner' })]);
    expect(filtered).toEqual([expect.objectContaining({ _id: 'a', active: true })]);
    expect(queries[1].values).toEqual([]);
  });
});

function mockDb(queries: Array<{ text: string; values?: unknown[] }>, rows: unknown[] = []): Queryable {
  return {
    async query<T = unknown>(text: string, values?: unknown[]) {
      queries.push({ text, values });
      return { rows: rows as T[] };
    }
  };
}
