import { describe, expect, it } from 'vitest';
import { createBackend } from '../../shared/src/backend';
import { MemoryRepository } from '../../shared/src/repositories/memory';
import type { BackendContext } from '../../shared/src/types';

const fixedNow = () => new Date('2026-06-04T10:00:00.000Z');

function newBackend() {
  let seq = 0;
  const repo = new MemoryRepository();
  const backend = createBackend({
    repo,
    now: fixedNow,
    idGenerator: (prefix) => `${prefix}_${++seq}`
  });
  return { backend, repo };
}

describe('security and export behavior', () => {
  it('prevents one user from mutating another user holding', async () => {
    const { backend } = newBackend();
    const userA = await backend.userLogin({}, { openid: 'openid-a' });
    const userB = await backend.userLogin({}, { openid: 'openid-b' });
    const ctxA: BackendContext = { userId: userA.userId };
    const ctxB: BackendContext = { userId: userB.userId };

    const account = await backend.upsertAccount({ type: 'CASH', name: 'A', currency: 'CNY', active: true }, ctxA);
    const holding = await backend.upsertHolding({
      accountId: account._id,
      assetType: 'CASH',
      symbol: 'CNY',
      name: 'Cash',
      quantity: 100,
      costAmount: 100,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctxA);

    await expect(backend.upsertHolding({
      _id: holding._id,
      accountId: account._id,
      assetType: 'CASH',
      symbol: 'CNY',
      name: 'Cash',
      quantity: 0,
      costAmount: 0,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctxB)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('exports user-owned non-sensitive data and never includes OAuth token fields', async () => {
    const { backend, repo } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-export' });
    const ctx: BackendContext = { userId: login.userId };

    const account = await backend.upsertAccount({ type: 'CASH', name: 'Manual', currency: 'CNY', active: true }, ctx);
    await backend.upsertHolding({ accountId: account._id, assetType: 'CASH', symbol: 'CNY', name: 'Cash', quantity: 88, costAmount: 88, costCurrency: 'CNY', source: 'MANUAL', active: true }, ctx);
    await repo.set('oauth_tokens', {
      _id: 'token_1',
      userId: login.userId,
      provider: 'IBKR',
      accountId: account._id,
      encryptedAccessToken: 'secret-access-token',
      encryptedRefreshToken: 'secret-refresh-token',
      expiresAt: '2026-12-31T00:00:00.000Z',
      createdAt: fixedNow().toISOString(),
      updatedAt: fixedNow().toISOString()
    });

    const exported = await backend.exportData({ format: 'CSV' }, ctx);

    expect(exported.files.map((file) => file.name)).toEqual([
      'holdings.csv',
      'cashflows.csv',
      'daily_snapshots.csv'
    ]);
    expect(JSON.stringify(exported)).toContain('Manual');
    expect(JSON.stringify(exported)).not.toContain('secret-access-token');
    expect(JSON.stringify(exported)).not.toContain('encryptedAccessToken');
    expect(JSON.stringify(exported)).not.toContain('oauth_tokens');
  });

  it('fails IBKR auth explicitly when provider settings are absent without exposing token material', async () => {
    const { backend } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-ibkr' });

    await expect(backend.startIbkrAuth({ accountId: 'missing' }, { userId: login.userId }))
      .rejects.toMatchObject({
        code: 'PROVIDER_NOT_CONFIGURED',
        provider: 'IBKR'
      });
  });
});
