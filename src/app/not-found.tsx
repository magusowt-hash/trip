import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container page">
      <div className="card grid" style={{ textAlign: 'center', padding: 'var(--space-32)' }}>
        <h1 className="page-title">404</h1>
        <p className="page-desc" style={{ margin: 0 }}>
          页面不存在或链接已失效。
        </p>
        <div>
          <Link href="/explore" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            返回发现
          </Link>
        </div>
      </div>
    </main>
  );
}
