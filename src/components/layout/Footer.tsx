export function Footer() {
  return (
    <footer className="container" style={{ color: 'var(--color-text-muted)', padding: '20px 0 28px' }}>
      <small>{new Date().getFullYear()} Trip Web</small>
    </footer>
  );
}
