'use client';

import { useState } from 'react';
import AppShell from '../components/AppShell';
import RequireAuth from '../components/RequireAuth';
import { apiCall } from '../lib/api';

export default function SyncPage() {
  const [message, setMessage] = useState('等待真实同步');
  const [statuses, setStatuses] = useState([]);
  const [failures, setFailures] = useState([]);

  async function run(name, label) {
    setMessage(`${label}中...`);
    setFailures([]);
    try {
      const result = await apiCall(name, name === 'syncPrices' ? { force: true } : { generatedBy: 'MANUAL' });
      setMessage(`${label}完成：${result.jobId || result.date || 'OK'}`);
      if (result.sourceStatuses) setStatuses(result.sourceStatuses);
      if (result.failures) setFailures(result.failures);
    } catch (error) {
      setMessage(`${label}失败：${error.message || '请稍后重试，或手动补录价格'}`);
    }
  }

  async function runFullSync() {
    setMessage('同步价格并生成快照中...');
    setFailures([]);
    try {
      const priceResult = await apiCall('syncPrices', { force: true });
      const snapshot = await apiCall('generateDailySnapshot', { generatedBy: 'MANUAL' });
      setStatuses(priceResult.sourceStatuses || []);
      setFailures(priceResult.failures || []);
      setMessage(`今日同步完成：${snapshot.date || priceResult.jobId || 'OK'}`);
    } catch (error) {
      setMessage(`今日同步失败：${error.message || '请稍后重试，或手动补录价格'}`);
    }
  }

  return (
    <RequireAuth>
      <AppShell>
        <header className="page-header">
          <div>
            <p className="eyebrow">SYNC</p>
            <h1>同步</h1>
            <p className="muted">手动触发行情同步与每日快照生成。</p>
          </div>
        </header>

        <section className="card form">
          <h2>今日资产同步</h2>
          <button className="button button-primary" onClick={runFullSync}>一键同步行情并更新曲线</button>
          <button className="button" onClick={() => run('syncPrices', '同步价格')}>仅同步价格</button>
          <button className="button" onClick={() => run('generateDailySnapshot', '生成快照')}>仅生成快照</button>
          <p className="muted">{message}</p>
        </section>

        <section className="card section metric-card">
          <h2>数据源同步状态</h2>
          {statuses.length ? statuses.map((item) => (
            <div key={item.key} className="row">
              <span>{item.label || item.key}</span>
              <span className={item.status === 'SUCCESS' ? 'trend-positive' : item.status === 'PARTIAL' ? 'trend-warning' : 'trend-negative'}>
                {item.message || item.status}
              </span>
            </div>
          )) : <p className="muted">点击“一键同步行情并更新曲线”后会显示各数据源的同步结果。</p>}
          {failures.map((item) => (
            <p key={`${item.category}-${item.symbol}-${item.provider}`} className="trend-negative">
              {item.symbol}: {item.reason || '需使用旧价格或手动补录'}
            </p>
          ))}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
