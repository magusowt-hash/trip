'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';
import styles from './page.module.css';

export default function AlistConfigPage() {
  const { token } = useAdminAuth();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rootPath, setRootPath] = useState('/');
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/alist/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setUrl(data.config.url || '');
          setUsername(data.config.username || '');
          setPassword('');
          setRootPath(data.config.rootPath || '/');
          setEnabled(data.config.enabled === 1);
        }
      });
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/alist/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, username, password: password || undefined, root_path: rootPath, enabled }),
      });
      const data = await res.json();
      setMessage(data.success ? '保存成功' : '保存失败');
    } catch { setMessage('保存失败'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/alist/config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResult(data.connected);
    } catch { setTestResult(false); }
    finally { setTesting(false); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>网盘配置</h1>
        <p className={styles.description}>配置 AList 连接地址、账户信息与根路径，用于后台云端资源接入。</p>
      </div>

      <div className={styles.card}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.label}>AList 地址</label>
            <input className={styles.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://alist.example.com" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>用户名</label>
            <input className={styles.input} value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>密码</label>
            <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={password ? '' : '不填则不修改'} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>根路径</label>
            <input className={styles.input} value={rootPath} onChange={e => setRootPath(e.target.value)} placeholder="/" />
          </div>
          <div className={styles.toggleRow}>
            <input type="checkbox" id="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <label htmlFor="enabled" className={styles.toggleLabel}>启用</label>
          </div>

          <div className={styles.actions}>
            <button onClick={handleSave} disabled={saving} className={styles.primaryButton}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={handleTest} disabled={testing} className={styles.secondaryButton}>
              {testing ? '测试中...' : '测试连接'}
            </button>
          </div>
        </div>
      </div>

      {testResult !== null && (
        <div className={`${styles.result} ${testResult ? styles.resultSuccess : styles.resultError}`}>
          {testResult ? '连接成功' : '连接失败，请检查配置'}
        </div>
      )}
      {message && (
        <div className={styles.message}>{message}</div>
      )}
    </div>
  );
}
