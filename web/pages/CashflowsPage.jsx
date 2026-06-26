'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import RequireAuth from '../components/RequireAuth';
import { apiCall } from '../lib/api';
import { money } from '../lib/format';

export default function CashflowsPage() {
  const [holdings, setHoldings] = useState([]);
  const [cashflows, setCashflows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('listHoldings', {}).then((result) => setHoldings(result.items || [])).catch(() => {});
    apiCall('listCashflows', {})
      .then((result) => setCashflows(result.items || []))
      .catch((err) => setError(err.message || 'Cashflows loading failed'));
  }, []);

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const holding = holdings.find((item) => item._id === form.get('holdingId'));
    await apiCall('upsertCashflow', {
      holdingId: holding?._id,
      type: form.get('type'),
      amount: numberValue(form.get('amount')),
      currency: String(form.get('currency') || 'CNY').trim() || 'CNY',
      quantity: optionalNumber(form.get('quantity')),
      tradeDate: String(form.get('tradeDate') || '').trim(),
      note: String(form.get('note') || '').trim() || undefined,
      source: 'MANUAL',
      status: 'CONFIRMED'
    });
    event.currentTarget.reset();
    const result = await apiCall('listCashflows', {});
    setCashflows(result.items || []);
  }

  return (
    <RequireAuth>
      <AppShell>
        <header className="page-header">
          <div>
            <p className="eyebrow">CASHFLOW</p>
            <h1>现金流</h1>
            <p className="muted">买入、卖出、入金与分红通过持仓名称关联，不需要手填内部 ID。</p>
          </div>
        </header>

        <form className="card form" onSubmit={save}>
          <h2>添加现金流</h2>
          <select className="select" name="holdingId" aria-label="关联持仓">
            <option value="">不关联持仓</option>
            {holdings.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.symbol}</option>)}
          </select>
          <div className="form-grid">
            <select className="select" name="type"><option>BUY</option><option>SELL</option><option>DEPOSIT</option><option>DIVIDEND</option></select>
            <input className="input" name="amount" inputMode="decimal" placeholder="金额" />
            <input className="input" name="currency" defaultValue="CNY" placeholder="币种" />
            <input className="input" name="quantity" inputMode="decimal" placeholder="数量（可选）" />
            <input className="input" name="tradeDate" type="date" />
          </div>
          <textarea className="textarea" name="note" placeholder="备注" />
          <button className="button button-primary">保存现金流</button>
        </form>

        <section className="section stack">
          {error ? <p className="error-text">Cashflows loading failed: {error}</p> : null}
          {!error && cashflows.length === 0 ? <p className="empty-state">No cashflows yet.</p> : null}
          {cashflows.map((item) => {
            const holding = holdings.find((asset) => asset._id === item.holdingId);
            return (
              <article key={item._id} className="card cashflow-item">
                <div className="row">
                  <div>
                    <div className="item-title">{item.type} · {holding?.name || '未关联持仓'}</div>
                    <div className="item-meta">{item.tradeDate} · {item.status}</div>
                  </div>
                  <strong>{money(item.amount, item.currency)}</strong>
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
