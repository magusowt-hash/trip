type StateBoxProps = {
  title: string;
  desc: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, desc, action }: StateBoxProps) {
  return (
    <div className="card grid" style={{ textAlign: 'center', padding: 24 }}>
      <strong>{title}</strong>
      <p className="page-desc" style={{ margin: 0 }}>{desc}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, desc, action }: StateBoxProps) {
  return (
    <div className="card grid" style={{ borderColor: 'var(--color-danger)', textAlign: 'center', padding: 24 }}>
      <strong style={{ color: 'var(--color-danger)' }}>{title}</strong>
      <p className="page-desc" style={{ margin: 0 }}>{desc}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ title = '加载中...' }: { title?: string }) {
  return (
    <div className="card row" style={{ justifyContent: 'center', padding: 24 }}>
      <span className="dot-loading" aria-hidden>
        ●
      </span>
      <span>{title}</span>
    </div>
  );
}
