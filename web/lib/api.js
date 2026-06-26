'use client';

const routes = {
  me: { path: '/api/me', method: 'GET' },
  userLogin: { path: '/api/auth/login', method: 'POST' },
  getDashboard: { path: '/api/dashboard', method: 'GET', query: (input) => ({ range: input.range }) },
  listAccounts: { path: '/api/accounts', method: 'GET', query: (input) => input },
  searchInstruments: { path: '/api/instruments/search', method: 'GET', query: (input) => ({ q: input.query, assetType: input.assetType }) },
  listHoldings: { path: '/api/holdings', method: 'GET', query: (input) => input },
  upsertHolding: { path: '/api/holdings', method: 'POST' },
  listCashflows: { path: '/api/cashflows', method: 'GET', query: (input) => input },
  upsertCashflow: { path: '/api/cashflows', method: 'POST' },
  listInvestmentPlans: { path: '/api/plans', method: 'GET', query: (input) => input },
  upsertInvestmentPlan: { path: '/api/plans', method: 'POST' },
  updateUserSettings: { path: '/api/settings', method: 'POST' },
  syncPrices: { path: '/api/sync/prices', method: 'POST' },
  generateDailySnapshot: { path: '/api/snapshots/generate', method: 'POST' },
  exportData: { path: '/api/export', method: 'GET' },
  logout: { path: '/api/auth/logout', method: 'POST' }
};

export async function apiCall(name, input = {}) {
  if (!routes[name]) {
    throw new Error(`Unknown API route: ${name}`);
  }

  const route = routes[name];
  const url = new URL(route.path, window.location.origin);
  const query = route.query?.(input) || {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  const response = await fetch(url.pathname + url.search, {
    method: route.method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: ['GET', 'DELETE'].includes(route.method) ? undefined : JSON.stringify(input)
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pat.loggedIn');
      window.location.assign('/login');
    }
    throw new Error('Unauthorized');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || payload.error || 'Request failed');
  }
  return payload.data;
}

export function isLoggedIn() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('pat.loggedIn') === 'true';
}

export function markLoggedIn() {
  localStorage.setItem('pat.loggedIn', 'true');
}

export function logout() {
  apiCall('logout', {}).finally(() => {
    localStorage.removeItem('pat.loggedIn');
    window.location.assign('/login');
  });
}
