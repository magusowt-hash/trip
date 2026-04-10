'use client';

/**
 * 根布局级错误兜底（含 layout 自身渲染失败时）
 * 必须包含 html / body
 */
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'Segoe UI, PingFang SC, Microsoft YaHei, sans-serif', background: '#f7f8fa' }}>
        <main style={{ maxWidth: 520, margin: '48px auto', padding: 24 }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <h1 style={{ marginTop: 0 }}>应用暂时不可用</h1>
            <p style={{ color: '#6b7280' }}>请刷新页面或稍后再试。</p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                marginTop: 16,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
