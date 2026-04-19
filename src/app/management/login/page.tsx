'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '../layout';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setAuthenticated } = useAdminAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        setAuthenticated(data.token);
        router.push('/management');
      } else {
        setError(data.error || '登录失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>管理后台登录</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="请输入管理密钥"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
        }
        .login-box {
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          width: 360px;
        }
        h1 { margin-bottom: 24px; text-align: center; font-size: 24px; }
        input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 16px;
          box-sizing: border-box;
        }
        .error { color: #f00; margin-top: 8px; font-size: 14px; }
        button {
          width: 100%;
          padding: 12px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          margin-top: 16px;
        }
        button:disabled { background: #ccc; cursor: not-allowed; }
      `}</style>
    </div>
  );
}