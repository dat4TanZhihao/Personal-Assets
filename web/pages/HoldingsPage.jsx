'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import RequireAuth from '../components/RequireAuth';
import { apiCall } from '../lib/api';
import { money } from '../lib/format';

const assetTypes = ['FUND', 'GOLD', 'STOCK', 'CASH'];

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState([]);
  const [error, setError] = useState('');
  const [assetType, setAssetType] = useState('STOCK');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [searchMessage, setSearchMessage] = useState('请输入股票/基金/现金代码并从候选项中选择。');

  useEffect(() => {
    refreshHoldings();
  }, []);

  useEffect(() => {
    const value = query.trim();
    setSelectedInstrument(null);
    if (value.length < 1) {
      setSuggestions([]);
      setSearchMessage('请输入股票/基金/现金代码并从候选项中选择。');
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiCall('searchInstruments', { query: value, assetType })
        .then((result) => {
          if (controller.signal.aborted) return;
          const items = result.items || [];
          setSuggestions(items);
          setSearchMessage(items.length ? '请选择一个匹配项后再保存。' : '没有匹配的代码，不能添加该资产。');
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setSearchMessage(`搜索失败：${err.message || '请稍后重试'}`);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, assetType]);

  async function refreshHoldings() {
    setError('');
    try {
      const result = await apiCall('listHoldings', {});
      setHoldings(result.items || []);
    } catch (err) {
      setError(err.message || 'Holdings loading failed');
    }
  }

  function chooseInstrument(item) {
    setSelectedInstrument(item);
    setQuery(item.symbol);
    setSuggestions([]);
    setSearchMessage(`${item.name} (${item.symbol}) 已选择。`);
  }

  async function save(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedInstrument) {
      setSearchMessage('必须先从候选项中选择一个匹配代码。');
      return;
    }
    const form = new FormData(formElement);
    await apiCall('upsertHolding', {
      assetType: selectedInstrument.assetType,
      symbol: selectedInstrument.symbol,
      name: selectedInstrument.name,
      instrumentToken: selectedInstrument.token,
      market: selectedInstrument.market,
      quantity: numberValue(form.get('quantity')),
      costAmount: numberValue(form.get('costAmount')),
      costCurrency: String(form.get('costCurrency') || selectedInstrument.currency || 'CNY').trim() || 'CNY',
      source: 'MANUAL',
      active: true
    });
    formElement.reset();
    setQuery('');
    setSuggestions([]);
    setSelectedInstrument(null);
    setSearchMessage('已保存。继续输入代码添加下一项。');
    await refreshHoldings();
  }

  async function syncPrices() {
    setError('');
    try {
      await apiCall('syncPrices', { force: true });
      await apiCall('generateDailySnapshot', { generatedBy: 'MANUAL' });
      await refreshHoldings();
    } catch (err) {
      setError(err.message || 'Price sync failed');
    }
  }

  return (
    <RequireAuth>
      <AppShell>
        <header className="page-header">
          <div>
            <p className="eyebrow">ASSETS</p>
            <h1>持仓</h1>
            <p className="muted">新增资产必须从搜索候选项中选择；没有匹配结果的代码不能保存。</p>
          </div>
        </header>

        <form className="card form" onSubmit={save}>
          <h2>新增持仓</h2>
          <div className="form-grid">
            <select className="select" name="assetType" aria-label="资产类型" value={assetType} onChange={(event) => setAssetType(event.target.value)}>
              {assetTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input className="input" name="symbolSearch" placeholder="输入代码或名称，如 AAPL / 600519" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
            <input className="input" name="selectedName" placeholder="选择后自动填入名称" value={selectedInstrument?.name || ''} readOnly />
            <input className="input" name="quantity" inputMode="decimal" placeholder="数量" />
            <input className="input" name="costAmount" inputMode="decimal" placeholder="成本金额" />
            <input className="input" name="costCurrency" placeholder="币种 CNY" defaultValue={selectedInstrument?.currency || 'CNY'} />
          </div>
          {suggestions.length ? (
            <div className="suggestion-list" role="listbox" aria-label="代码候选">
              {suggestions.map((item) => (
                <button key={`${item.assetType}-${item.symbol}`} className="suggestion-item" type="button" onClick={() => chooseInstrument(item)}>
                  <span>{item.symbol}</span>
                  <strong>{item.name}</strong>
                  <small>{item.assetType} · {item.market || 'GLOBAL'} · {item.source}</small>
                </button>
              ))}
            </div>
          ) : null}
          <p className={selectedInstrument ? 'trend-positive' : 'muted'}>{searchMessage}</p>
          <button className="button button-primary" disabled={!selectedInstrument}>保存持仓</button>
        </form>

        <section className="section stack">
          <button className="button button-primary button-full" onClick={syncPrices}>同步行情 / 刷新现价</button>
          {error ? <p className="error-text">Holdings loading failed: {error}</p> : null}
          {!error && holdings.length === 0 ? <p className="empty-state">No holdings yet.</p> : null}
          {holdings.map((item) => {
            const value = item.latestPrice ? item.latestPrice.price * item.quantity : item.costAmount;
            return (
              <article key={item._id} className="card holding-item">
                <div className="row">
                  <div>
                    <div className="item-title">{item.name}</div>
                    <div className="item-meta">{item.symbol} · {item.assetType}</div>
                  </div>
                  <strong>{money(value, item.costCurrency)}</strong>
                </div>
                <div className="grid section">
                  <div><div className="field-label">数量</div>{item.quantity}</div>
                  <div><div className="field-label">现价</div>{item.latestPrice ? money(item.latestPrice.price, item.latestPrice.currency) : '待同步'}</div>
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
