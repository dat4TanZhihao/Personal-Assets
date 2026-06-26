'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import RequireAuth from '../components/RequireAuth';
import { apiCall, logout } from '../lib/api';

export default function SettingsPage() {
  const [mode, setMode] = useState('INTERNATIONAL');
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiCall('me')
      .then((result) => setMode(result.user?.gainLossColorMode || 'INTERNATIONAL'))
      .catch(() => setMode('INTERNATIONAL'));
  }, []);

  async function saveMode(nextMode) {
    const previousMode = mode;
    setMode(nextMode);
    setMessage('保存中...');
    try {
      await apiCall('updateUserSettings', { gainLossColorMode: nextMode });
      setMessage('展示偏好已保存到服务端。');
    } catch (error) {
      setMode(previousMode);
      setMessage(`保存失败：${error.message || '请稍后重试'}`);
    }
  }

  async function exportJson() {
    const [holdings, cashflows, plans] = await Promise.all([
      apiCall('listHoldings', {}),
      apiCall('listCashflows', {}),
      apiCall('listInvestmentPlans', {})
    ]);
    const blob = new Blob([JSON.stringify({ holdings, cashflows, plans }, null, 2)], { type: 'application/json' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  return (
    <RequireAuth>
      <AppShell>
        <header className="page-header">
          <div>
            <p className="eyebrow">SETTINGS</p>
            <h1>设置</h1>
            <p className="muted">导出、退出登录与 PWA 安装提示。</p>
          </div>
        </header>

        <section className="card form">
          <h2>展示偏好</h2>
          <div className="row">
            <span>默认展示币种</span>
            <span className="status-pill">CNY</span>
          </div>
          <div className="chips">
            {['INTERNATIONAL', 'CHINA_MARKET'].map((item) => <button key={item} className={`chip ${mode === item ? 'mode-active' : ''}`} onClick={() => saveMode(item)}>{item}</button>)}
          </div>
          {message ? <p className="muted">{message}</p> : null}
        </section>

        <section className="card form section">
          <h2>导出</h2>
          <a className="button button-primary row" href="/api/export">下载 CSV</a>
          <button className="button" onClick={exportJson}>导出 JSON</button>
        </section>

        <section className="card form section">
          <h2>PWA 提示</h2>
          <p className="muted">在 iPhone Safari 中打开分享菜单，选择“添加到主屏幕”。离线 shell 会缓存基础页面。</p>
          <button className="button button-danger" onClick={logout}>退出登录</button>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
