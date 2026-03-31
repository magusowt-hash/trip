'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 生产可接入 Sentry / 日志平台
    console.error('[route error]', error);
  }, [error]);

  return (
    <main className="container page">
      <div className="card grid" style={{ textAlign: 'center', padding: 'var(--space-32)' }}>
        <h1 className="page-title">页面出错了</h1>
        <p className="page-desc" style={{ margin: 0 }}>
          请稍后重试。若问题持续，请联系运维。
        </p>
        {error.digest ? (
          <p style={{ fontSize: 'var(--font-caption)', color: 'var(--color-text-muted)' }}>
            错误标识：{error.digest}
          </p>
        ) : null}
        <div>
          <Button type="button" onClick={() => reset()}>
            重试
          </Button>
        </div>
      </div>
    </main>
  );
}
