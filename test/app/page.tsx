import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at top, rgba(14,165,233,0.18), transparent 30%), linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        color: '#0f172a',
        padding: 24,
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 16,
          width: 'min(420px, 100%)',
        }}
      >
        <Link
          href="/passport-visa"
          style={{
            padding: '16px 24px',
            borderRadius: 999,
            background: '#ffffff',
            border: '1px solid rgba(148,163,184,0.4)',
            boxShadow: '0 16px 30px rgba(148,163,184,0.18)',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          打开 /passport-visa
        </Link>
        <Link
          href="/passport-visa-admin"
          style={{
            padding: '16px 24px',
            borderRadius: 999,
            background: '#fff7ed',
            border: '1px solid rgba(212,165,42,0.45)',
            boxShadow: '0 16px 30px rgba(111,75,47,0.14)',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          打开 /passport-visa-admin
        </Link>
        <Link
          href="/test-layout-v2"
          style={{
            padding: '16px 24px',
            borderRadius: 999,
            background: '#ffffff',
            border: '1px solid rgba(148,163,184,0.4)',
            boxShadow: '0 16px 30px rgba(148,163,184,0.18)',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          打开 /test-layout-v2
        </Link>
        <Link
          href="/test-css"
          style={{
            padding: '16px 24px',
            borderRadius: 999,
            background: '#ffffff',
            border: '1px solid rgba(148,163,184,0.4)',
            boxShadow: '0 16px 30px rgba(148,163,184,0.18)',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          打开 /test-css
        </Link>
      </div>
    </main>
  );
}
