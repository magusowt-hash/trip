'use client';

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

function normalizePhone(input: string): string {
  const trimmed = input.trim();
  return trimmed.replace(/[\s-]/g, '');
}

function isValidPhone(phone: string): boolean {
  return /^\+?\d{8,15}$/.test(phone) || /^1\d{10}$/.test(phone);
}

export default function RegisterPage() {
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneError = useMemo(() => {
    if (!phone) return undefined;
    if (isValidPhone(normalizePhone(phone))) return undefined;
    return '请输入有效手机号';
  }, [phone]);

  const passwordError = useMemo(() => {
    if (!password) return undefined;
    if (password.length >= 8) return undefined;
    return '密码至少 8 位';
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirmPassword) return undefined;
    if (confirmPassword === password) return undefined;
    return '两次输入的密码不一致';
  }, [confirmPassword, password]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const ok =
      !phoneError &&
      !passwordError &&
      !confirmError &&
      isValidPhone(normalizePhone(phone)) &&
      password.length >= 8 &&
      confirmPassword === password;

    if (!ok) {
      setError('请检查输入');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizePhone(phone), password, confirmPassword }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? '注册失败');
        return;
      }

      router.push('/explore');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container page">
      <div className={styles.root}>
        <div className={styles.fadeIn}>
          <h1 className={styles.title}>注册</h1>
          <p className={styles.sub}>创建你的账号</p>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.fieldGroup}>
              <Input
                label="手机号"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                type="tel"
                autoComplete="tel"
                error={phoneError}
                style={{
                  border: 'none',
                  borderBottom: `1px solid ${phoneError ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  borderRadius: 0,
                  boxShadow: 'none',
                  padding: '10px 0',
                  background: 'transparent',
                  transition: 'border-color 0.2s ease',
                }}
              />
              <Input
                label="密码"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                type="password"
                autoComplete="new-password"
                error={passwordError}
                style={{
                  border: 'none',
                  borderBottom: `1px solid ${passwordError ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  borderRadius: 0,
                  boxShadow: 'none',
                  padding: '10px 0',
                  background: 'transparent',
                  transition: 'border-color 0.2s ease',
                }}
              />
              <Input
                label="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                type="password"
                autoComplete="new-password"
                error={confirmError}
                style={{
                  border: 'none',
                  borderBottom: `1px solid ${confirmError ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  borderRadius: 0,
                  boxShadow: 'none',
                  padding: '10px 0',
                  background: 'transparent',
                  transition: 'border-color 0.2s ease',
                }}
              />
            </div>

            <div className={styles.actions}>
              <Button type="submit" disabled={submitting}>
                {submitting ? '创建中…' : '注册'}
              </Button>
            </div>

            {error ? <div className={styles.errorBox}>{error}</div> : null}
          </form>

          <div className={styles.switchRow}>
            已有账号？
            <button
              type="button"
              className={styles.switchBtn}
              onClick={() => router.push('/login')}
            >
              去登录
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

