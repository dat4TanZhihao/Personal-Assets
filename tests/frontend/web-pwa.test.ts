import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function file(path: string): string {
  const absolute = join(root, path);
  expect(existsSync(absolute), `${path} should exist`).toBe(true);
  return readFileSync(absolute, 'utf8');
}

describe('Next.js Web PWA frontend', () => {
  it('declares installable PWA metadata, manifest, icon, and service worker', () => {
    const layout = file('app/layout.tsx');
    const manifest = JSON.parse(file('public/manifest.webmanifest')) as Record<string, unknown>;
    const sw = file('public/sw.js');

    expect(layout).toContain("manifest: '/manifest.webmanifest'");
    expect(layout).toContain('appleWebApp');
    expect(layout).toContain('themeColor');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/dashboard');
    expect(file('public/apple-touch-icon.svg')).toContain('<svg');
    expect(sw).toContain('CACHE_NAME');
    expect(sw).toContain("caches.match('/dashboard')");
  });

  it('implements login, bottom navigation, safe-area layout, and iPhone touch targets', () => {
    const login = file('web/pages/LoginPage.jsx');
    const nav = file('web/components/AppShell.jsx');
    const css = file('app/globals.css');

    expect(login).toContain("apiCall('userLogin'");
    expect(login).toContain('/dashboard');
    expect(nav).toContain('bottom-nav');
    for (const href of ['/dashboard', '/holdings', '/cashflows', '/plans', '/sync', '/settings']) {
      expect(nav).toContain(href);
    }
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('overflow-x: hidden');
  });

  it('renders required pages and dashboard range labels', () => {
    for (const path of ['app/page.jsx', 'app/dashboard/page.jsx', 'app/holdings/page.jsx', 'app/cashflows/page.jsx', 'app/plans/page.jsx', 'app/sync/page.jsx', 'app/settings/page.jsx']) {
      expect(file(path)).toBeTruthy();
    }
    const dashboard = file('web/pages/DashboardPage.jsx');
    for (const label of ['1W', '1M', '6M', '1Y', 'ALL']) {
      expect(dashboard).toContain(label);
    }
    expect(dashboard).toContain('资产配置');
    expect(dashboard).toContain('同步状态');
  });

  it('does not expose manual internal id copy in entry forms', () => {
    const forms = [
      file('web/pages/HoldingsPage.jsx'),
      file('web/pages/CashflowsPage.jsx'),
      file('web/pages/PlansPage.jsx')
    ].join('\n');

    expect(forms).not.toContain('account_xxx');
    expect(forms).not.toContain('holding_xxx');
    expect(forms).not.toContain('账户 ID');
    expect(forms).not.toContain('持仓 ID');
    expect(forms).toContain('<select className="select" name="holdingId"');
    expect(file('web/pages/HoldingsPage.jsx')).not.toContain('name="accountId"');
    expect(forms).toContain('numberValue(form.get');
  });

  it('requires holding symbols to be selected from instrument search results', () => {
    const holdings = file('web/pages/HoldingsPage.jsx');
    const api = file('web/lib/api.js');

    expect(api).toContain('/api/instruments/search');
    expect(holdings).toContain("apiCall('searchInstruments'");
    expect(holdings).toContain('setSelectedInstrument(item)');
    expect(holdings).toContain('instrumentToken: selectedInstrument.token');
    expect(holdings).toContain('const formElement = event.currentTarget');
    expect(holdings).toContain('formElement.reset()');
    expect(holdings).toContain('disabled={!selectedInstrument}');
    expect(holdings).toContain('没有匹配结果的代码不能保存');
  });

  it('generates snapshots after price sync so the dashboard curve can refresh', () => {
    const holdings = file('web/pages/HoldingsPage.jsx');
    const sync = file('web/pages/SyncPage.jsx');

    expect(holdings).toContain("apiCall('syncPrices'");
    expect(holdings).toContain("apiCall('generateDailySnapshot'");
    expect(sync).toContain('runFullSync');
    expect(sync).toContain("apiCall('syncPrices'");
    expect(sync).toContain("apiCall('generateDailySnapshot'");
    expect(sync).toContain('一键同步行情并更新曲线');
  });

  it('uses a continuous svg polyline/path for the asset curve', () => {
    const chart = file('web/components/LineChart.jsx');

    expect(chart).toContain('<polyline');
    expect(chart).toContain('points.join');
    expect(chart).toContain('chart-line');
    expect(chart).not.toContain('chart-bars');
  });
});
