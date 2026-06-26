'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import LineChart from '../components/LineChart';
import RequireAuth from '../components/RequireAuth';
import { apiCall } from '../lib/api';
import { money, percent, signedMoney, trendClass } from '../lib/format';

const ranges = ['1W', '1M', '6M', '1Y', 'ALL'];
const emptyDashboard = {
  summary: {
    totalValue: 0,
    dailyInvestmentProfit: 0,
    dailyInvestmentReturn: 0,
    cumulativeInvestmentProfit: 0,
    cumulativeInvestmentReturn: 0,
    snapshotTime: '',
    dataCompleteness: 'EMPTY',
    priceStatus: 'EMPTY',
    trustNotes: []
  },
  breakdown: { fund: 0, gold: 0, stock: 0, cash: 0 },
  series: []
};

export default function DashboardPage() {
  const [range, setRange] = useState('1W');
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    apiCall('getDashboard', { range })
      .then((result) => setDashboard(result || emptyDashboard))
      .catch((err) => {
        setDashboard(emptyDashboard);
        setError(err.message || 'Dashboard loading failed');
      });
  }, [range]);

  const summary = dashboard.summary;
  const allocation = [
    ['基金', dashboard.breakdown.fund],
    ['黄金', dashboard.breakdown.gold],
    ['股票', dashboard.breakdown.stock],
    ['现金', dashboard.breakdown.cash]
  ];

  return (
    <RequireAuth>
      <AppShell>
        <header className="page-header">
          <div>
            <p className="eyebrow">PERSONAL NET WORTH</p>
            <h1>总览</h1>
            <p className="muted">同步状态、资产配置与连续资产曲线。</p>
          </div>
          <span className="status-pill">{summary.priceStatus}</span>
        </header>

        <section className="card hero">
          <div className="hero-label">总资产</div>
          <div className="hero-amount">{money(summary.totalValue)}</div>
          {error ? <p className="error-text">Dashboard loading failed: {error}</p> : null}
          <p className="muted">快照：{summary.snapshotTime || '尚未生成快照'}</p>
        </section>

        <section className="grid section">
          <div className="card metric-card">
            <div className="field-label">今日收益</div>
            <div className={`metric-value ${trendClass(summary.dailyInvestmentProfit)}`}>{signedMoney(summary.dailyInvestmentProfit)}</div>
            <div className={trendClass(summary.dailyInvestmentReturn)}>{percent(summary.dailyInvestmentReturn)}</div>
          </div>
          <div className="card metric-card">
            <div className="field-label">累计收益</div>
            <div className={`metric-value ${trendClass(summary.cumulativeInvestmentProfit)}`}>{signedMoney(summary.cumulativeInvestmentProfit)}</div>
            <div className={trendClass(summary.cumulativeInvestmentReturn)}>{percent(summary.cumulativeInvestmentReturn)}</div>
          </div>
        </section>

        <section className="section">
          <div className="segmented" aria-label="资产曲线范围">
            {ranges.map((item) => <button key={item} className={`chip ${range === item ? 'chip-active' : ''}`} onClick={() => setRange(item)}>{item}</button>)}
          </div>
        </section>

        <section className="card section hero">
          <div className="row">
            <h2>连续资产曲线</h2>
            <span className="muted">总资产</span>
          </div>
          <LineChart series={dashboard.series} metric="totalValue" />
        </section>

        <section className="section stack">
          <h2>资产配置</h2>
          {allocation.map(([label, value]) => (
            <div key={label} className="card metric-card">
              <div className="row">
                <span>{label}</span>
                <span>{money(value)}</span>
              </div>
              <div className="allocation-bar" aria-label={`${label} 占比`}>
                <div className="allocation-fill" style={{ width: `${summary.totalValue > 0 ? Math.max((value / summary.totalValue) * 100, 4) : 0}%` }} />
              </div>
            </div>
          ))}
        </section>

        <section className="card section metric-card">
          <div className="row">
            <span>同步状态</span>
            <span className="muted">{summary.dataCompleteness}</span>
          </div>
          {(summary.trustNotes || []).map((note) => <p key={note} className="muted">{note}</p>)}
          {!error && !(summary.trustNotes || []).length ? <p className="muted">No sync notes yet.</p> : null}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
