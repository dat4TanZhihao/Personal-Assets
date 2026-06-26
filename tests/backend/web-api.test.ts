import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { startDateForRange } from '../../shared/src/utils/date';
import { MemoryRepository } from '../../shared/src/repositories/memory';
import { resetWebRepositoryForTests } from '../../shared/src/repositories/web';
import { resetWebBackendForTests } from '../../web/server/api';
import { POST as login } from '../../app/api/auth/login/route';
import { GET as me } from '../../app/api/me/route';
import { GET as dashboard } from '../../app/api/dashboard/route';
import { GET as health } from '../../app/api/health/route';
import { GET as searchInstruments } from '../../app/api/instruments/search/route';
import { POST as createHolding } from '../../app/api/holdings/route';

describe('web API auth and ranges', () => {
  beforeEach(() => {
    process.env.OWNER_PASSWORD = 'correct-password';
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.REQUIRE_INSTRUMENT_TOKEN = 'true';
    resetWebBackendForTests();
    resetWebRepositoryForTests(new MemoryRepository());
  });

  afterEach(() => {
    delete process.env.OWNER_PASSWORD;
    delete process.env.SESSION_SECRET;
    delete process.env.REQUIRE_INSTRUMENT_TOKEN;
    resetWebBackendForTests();
    resetWebRepositoryForTests();
  });

  it('logs in with owner password and sets an HttpOnly SameSite=Lax session cookie', async () => {
    const response = await login(jsonRequest('http://localhost/api/auth/login', { password: 'correct-password' }));
    const body = await response.json() as { data: { userId: string } };
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ data: { userId: 'owner' } });
    expect(cookie).toContain('pat_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('can disable secure session cookies for temporary HTTP IP-only deployment', async () => {
    process.env.SESSION_COOKIE_SECURE = 'false';

    const response = await login(jsonRequest('http://localhost/api/auth/login', { password: 'correct-password' }));
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(cookie).toContain('pat_session=');
    expect(cookie).not.toContain('Secure');
    delete process.env.SESSION_COOKIE_SECURE;
  });

  it('exposes a health endpoint for deployment checks', async () => {
    const response = await health();
    const body = await response.json() as { data: { ok: boolean; storage: string } };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ ok: true, storage: 'memory' });
  });

  it('returns a safe 401 JSON envelope for unauthenticated API calls', async () => {
    const response = await me(new Request('http://localhost/api/me'));
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Login is required'
      }
    });
  });

  it('returns a safe 401 JSON envelope for unauthenticated holding writes', async () => {
    const response = await createHolding(jsonRequest('http://localhost/api/holdings', {
      assetType: 'STOCK',
      symbol: 'AAPL',
      name: 'Apple',
      quantity: 1,
      costAmount: 100,
      costCurrency: 'USD',
      source: 'MANUAL',
      active: true
    }));
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(401);
    expect(body.error).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Login is required'
    });
  });

  it('accepts the Web dashboard range values after login', async () => {
    const loginResponse = await login(jsonRequest('http://localhost/api/auth/login', { password: 'correct-password' }));
    const cookie = loginResponse.headers.get('set-cookie') ?? '';
    const response = await dashboard(new Request('http://localhost/api/dashboard?range=1W', {
      headers: { cookie }
    }));
    const body = await response.json() as { data: { series: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.data.series).toEqual([]);
    expect(startDateForRange('1W', '2026-06-22')).toBe('2026-06-16');
    expect(startDateForRange('1M', '2026-06-22')).toBe('2026-05-24');
    expect(startDateForRange('6M', '2026-06-22')).toBe('2025-12-22');
    expect(startDateForRange('1Y', '2026-06-22')).toBe('2025-06-23');
    expect(startDateForRange('7D', '2026-06-22')).toBe('2026-06-16');
  });

  it('requires holdings to use a selectable instrument from the instrument search library', async () => {
    const loginResponse = await login(jsonRequest('http://localhost/api/auth/login', { password: 'correct-password' }));
    const cookie = loginResponse.headers.get('set-cookie') ?? '';

    const searchResponse = await searchInstruments(new Request('http://localhost/api/instruments/search?q=AAPL&assetType=STOCK', {
      headers: { cookie }
    }));
    const searchBody = await searchResponse.json() as { data: { items: Array<{ symbol: string; name: string; token?: string }> } };
    const apple = searchBody.data.items.find((item) => item.symbol === 'AAPL');
    expect(searchResponse.status).toBe(200);
    expect(searchBody.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'AAPL', name: 'Apple Inc.', token: expect.any(String) })
    ]));
    expect(apple?.token).toBeTruthy();

    const invalidResponse = await createHolding(jsonRequest('http://localhost/api/holdings', {
      assetType: 'STOCK',
      symbol: 'NOT_A_REAL_CODE',
      name: 'Not real',
      quantity: 1,
      costAmount: 1,
      costCurrency: 'USD',
      source: 'MANUAL',
      active: true
    }, cookie));
    const invalidBody = await invalidResponse.json() as { error: { code: string } };
    expect(invalidResponse.status).toBe(422);
    expect(invalidBody.error.code).toBe('UNKNOWN_INSTRUMENT');

    const bypassResponse = await createHolding(jsonRequest('http://localhost/api/holdings', {
      assetType: 'STOCK',
      symbol: 'AAPL',
      name: 'User supplied name should be normalized',
      quantity: 2,
      costAmount: 300,
      costCurrency: 'USD',
      source: 'MANUAL',
      active: true
    }, cookie));
    const bypassBody = await bypassResponse.json() as { error: { code: string } };
    expect(bypassResponse.status).toBe(422);
    expect(bypassBody.error.code).toBe('UNKNOWN_INSTRUMENT');

    const validResponse = await createHolding(jsonRequest('http://localhost/api/holdings', {
      assetType: 'STOCK',
      symbol: 'AAPL',
      name: 'User supplied name should be normalized',
      instrumentToken: apple?.token,
      quantity: 2,
      costAmount: 300,
      costCurrency: 'USD',
      source: 'MANUAL',
      active: true
    }, cookie));
    const validBody = await validResponse.json() as { data: { symbol: string; name: string; market: string } };
    expect(validResponse.status).toBe(201);
    expect(validBody.data).toEqual(expect.objectContaining({ symbol: 'AAPL', name: 'Apple Inc.', market: 'US' }));
  });
});

function jsonRequest(url: string, body: unknown, cookie?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}
