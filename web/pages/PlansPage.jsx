'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import RequireAuth from '../components/RequireAuth';
import { apiCall } from '../lib/api';
import { money } from '../lib/format';

export default function PlansPage() {
  const [holdings, setHoldings] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('listHoldings', { assetType: 'FUND' }).then((result) => setHoldings((result.items || []).filter((item) => item.assetType === 'FUND'))).catch(() => {});
    apiCall('listInvestmentPlans', {})
      .then((result) => setPlans(result.items || []))
      .catch((err) => setError(err.message || 'Plans loading failed'));
  }, []);

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const holding = holdings.find((item) => item._id === form.get('holdingId'));
    if (!holding) return;
    await apiCall('upsertInvestmentPlan', {
      holdingId: holding._id,
      name: String(form.get('name') || '').trim(),
      amountPerPeriod: numberValue(form.get('amountPerPeriod')),
      currency: 'CNY',
      frequency: form.get('frequency'),
      startDate: String(form.get('startDate') || '').trim(),
      feeRate: optionalNumber(form.get('feeRate')),
      status: 'ACTIVE',
      nonTradingDayRule: 'NEXT_TRADING_DAY'
    });
    event.currentTarget.reset();
    const result = await apiCall('listInvestmentPlans', {});
    setPlans(result.items || []);
  }

  return (
    <RequireAuth>
      <AppShell>
        <header className="page-header">
          <div>
            <p className="eyebrow">DCA</p>
            <h1>定投</h1>
            <p className="muted">选择基金持仓创建计划，不暴露内部持仓标识。</p>
          </div>
        </header>

        <form className="card form" onSubmit={save}>
          <h2>新建定投计划</h2>
          <select className="select" name="holdingId" aria-label="选择基金持仓">
            <option value="">选择基金持仓</option>
            {holdings.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.symbol}</option>)}
          </select>
          <input className="input" name="name" placeholder="计划名称" />
          <div className="form-grid">
            <input className="input" name="amountPerPeriod" inputMode="decimal" placeholder="每期金额" />
            <select className="select" name="frequency"><option>WEEKLY</option><option>BIWEEKLY</option><option>MONTHLY</option></select>
            <input className="input" name="startDate" type="date" />
            <input className="input" name="feeRate" inputMode="decimal" placeholder="费率，可选" />
          </div>
          <button className="button button-primary">保存计划</button>
        </form>

        <section className="section stack">
          {error ? <p className="error-text">Plans loading failed: {error}</p> : null}
          {!error && plans.length === 0 ? <p className="empty-state">No investment plans yet.</p> : null}
          {plans.map((item) => {
            const holding = holdings.find((asset) => asset._id === item.holdingId);
            return (
              <article key={item._id} className="card plan-item">
                <div className="row">
                  <div>
                    <div className="item-title">{item.name}</div>
                    <div className="item-meta">{holding?.name || item.symbol} · {item.frequency} · 下次 {item.nextRunDate || '待计算'}</div>
                  </div>
                  <strong>{money(item.amountPerPeriod, item.currency)}</strong>
                </div>
              </article>
            );
          })}
        </section>
      </AppShell>
    </RequireAuth>
  );
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
