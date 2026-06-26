'use client';

import { useState } from 'react';
import { apiCall, markLoggedIn } from '../lib/api';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await apiCall('userLogin', { password: form.get('password') });
      markLoggedIn();
      window.location.assign('/dashboard');
    } catch {
      setError('密码不正确，或服务端登录配置还没有完成。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell login-page">
      <div className="login-mark">Y</div>
      <div>
        <p className="eyebrow">WEB PWA</p>
        <h1>个人资产净值</h1>
        <p className="muted">为 iPhone 主屏幕优化的资产、现金流与定投追踪。</p>
      </div>
      <form className="card form" onSubmit={login}>
        <label>
          <span className="field-label">昵称</span>
          <input className="input" name="nickname" placeholder="你的昵称" autoComplete="nickname" />
        </label>
        <label>
          <span className="field-label">访问密码</span>
          <input className="input" name="password" type="password" placeholder="输入 Web 登录密码" autoComplete="current-password" />
        </label>
        <button className="button button-primary button-full" disabled={loading}>{loading ? '登录中...' : '登录 / 继续'}</button>
        {error ? <p className="trend-negative">{error}</p> : <p className="muted">登录态由服务端 session cookie 保护；未登录访问会回到本页。</p>}
      </form>
    </main>
  );
}
